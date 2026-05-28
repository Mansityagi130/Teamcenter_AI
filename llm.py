import getpass
import os
import json
import asyncio
from dotenv import load_dotenv
import sys
import requests

from google import genai
from google.genai import types
from pathlib import Path
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
GEMINI_API_KEY = os.getenv("Gemini_API_Key")
model = os.getenv("Gemini_Model_Name")
backend_url = os.getenv("BACKEND_URL", "http://127.0.0.1:8000")
client = genai.Client(api_key=GEMINI_API_KEY)

BACKEND_JWT = None
BACKEND_API_KEY = None
BACKEND_HEADERS = {}


def build_server_params():
    env = os.environ.copy()
    if BACKEND_API_KEY:
        env["BACKEND_API_KEY"] = BACKEND_API_KEY
    env["BACKEND_URL"] = backend_url
    return StdioServerParameters(
        command=str(sys.executable),
        args=["test_mcp.py"],
        env=env,
        cwd=BASE_DIR,
    )


def prompt_for_credentials():
    username = input("Backend username: ").strip()
    password = getpass.getpass("Backend password: ")
    return username, password


def backend_request(method: str, path: str, **kwargs):
    if BACKEND_API_KEY is None:
        raise RuntimeError("Backend API key is not initialized")
    headers = kwargs.pop("headers", {})
    headers.update(BACKEND_HEADERS)
    url = backend_url.rstrip("/") + path
    response = requests.request(method, url, headers=headers, **kwargs)
    if not response.ok:
        raise RuntimeError(f"Backend request failed: {response.status_code} {response.text}")
    return response.json()


def backend_login(username: str, password: str) -> str:
    response = requests.post(
        f"{backend_url.rstrip('/')}/login",
        json={"username": username, "password": password},
    )
    if response.status_code != 200:
        raise RuntimeError(f"Login failed: {response.status_code} {response.text}")
    return response.json()["access_token"]


def backend_generate_api_key(jwt_token: str) -> str:
    response = requests.post(
        f"{backend_url.rstrip('/')}/generate-api-key",
        headers={"Authorization": f"Bearer {jwt_token}"},
    )
    if response.status_code != 200:
        raise RuntimeError(f"API key generation failed: {response.status_code} {response.text}")
    return response.json()["api_key"]


async def get_mcp_tools():
    async with stdio_client(build_server_params()) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools_result = await session.list_tools()
            declarations = []
            for tool in tools_result.tools:
                declarations.append(
                    types.FunctionDeclaration(
                        name=tool.name,
                        description=tool.description or "",
                        parameters={
                            "type": "object",
                            "properties": tool.inputSchema.get("properties", {}),
                            "required": tool.inputSchema.get("required", []),
                        },
                    )
                )
            return declarations


async def call_mcp_tool(tool_name: str, arguments: dict):
    async with stdio_client(build_server_params()) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(tool_name, arguments=arguments)
            return result


def extracted_mcp_results(mcp_result):
    extracted = []
    for content in mcp_result.content:
        if hasattr(content, "text"):
            try:
                extracted.append(json.loads(content.text))
            except Exception:
                extracted.append(content.text)
    if len(extracted) == 1:
        return extracted[0]
    return extracted


async def main():
    global BACKEND_JWT, BACKEND_API_KEY, BACKEND_HEADERS

    username, password = prompt_for_credentials()
    BACKEND_JWT = backend_login(username, password)
    BACKEND_API_KEY = backend_generate_api_key(BACKEND_JWT)
    BACKEND_HEADERS = {
        "X-API-Key": BACKEND_API_KEY,
        "Authorization": f"Bearer {BACKEND_JWT}",
    }
    print("Logged in to backend and obtained API key.")

    # Optional health check using authenticated headers
    try:
        health = backend_request("GET", "/health")
        print("Backend health:", health)
    except Exception as exc:
        print("Warning: backend health check failed:", exc)

    mcp_tool_declarations = await get_mcp_tools()

    config = types.GenerateContentConfig(
        tools=[
            types.Tool(
                function_declarations=mcp_tool_declarations
            )
        ],
        system_instruction="""
You are a Teamcenter AI assistant.

You have access to MCP tools.
The MCP server communicates with a backend API.

Rules:
1. Use health_check when user asks about backend/server status.
2. Use search_item when user asks for a specific Teamcenter item.
3. Use list_items when user asks to list all items.
4. Use add_item when user asks to create a new Teamcenter item.
5. Do not invent Teamcenter data.
6. Always explain tool results clearly.
"""
    )

    chat = client.chats.create(
        model=model,
        config=config,
    )

    print("=" * 70)
    print("Gemini Agent → MCP Server → Backend API")
    print("Type 'exit' to stop")
    print("=" * 70)

    while True:
        user_input = input("\nUser: ")
        if user_input.lower() in ["exit", "quit"]:
            print("\nAgent stopped.")
            break

        response = chat.send_message(user_input)
        if response.function_calls:
            for function_call in response.function_calls:
                tool_name = function_call.name
                tool_args = dict(function_call.args)
                print(f"\n[MCP Tool Selected: {tool_name}]")
                print(f"[Arguments: {tool_args}]")
                raw_mcp_result = await call_mcp_tool(tool_name=tool_name, arguments=tool_args)
                tool_result = extracted_mcp_results(raw_mcp_result)
                print(f"[MCP → Backend Result: {tool_result}]")
                final_response = chat.send_message(
                    types.Part.from_function_response(
                        name=tool_name,
                        response={"result": tool_result},
                    )
                )
                print("\nAssistant:")
                print(final_response.text)
        else:
            print("\nAssistant:")
            print(response.text)


if __name__ == "__main__":
    asyncio.run(main())
