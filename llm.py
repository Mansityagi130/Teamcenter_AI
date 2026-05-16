from dotenv import load_dotenv
import os
import requests
from google import genai
from google.genai import types

load_dotenv()
client = genai.Client(api_key=os.getenv("Gemini_Api_Key"))
model=os.getenv("Gemini_Model_Name")
backend_url=os.getenv("BACKEND_URL")

def health_check():
    """Checks the health of the backend server."""
    response = requests.get(f"{backend_url}/health")
    return response.json()
def call_remember_fact(content: str):
    """Calls the remember factory tool in the backend server."""
    payload = {"content": content}
    response = requests.post(f"{backend_url}/tools/remember", json=payload)
    return response.json()
def call_recall_fact():
    """Calls the recall factory tool in the backend server."""
    response = requests.get(f"{backend_url}/tools/recall")
    return response.json()
def call_teamcenter_search(item_id: str):
    """Calls the Teamcenter search tool in the backend server."""
    payload = {"item_id": item_id}
    response = requests.post(f"{backend_url}/tools/teamcenter/search", json=payload)
    return response.json()
TOOL_FUNCTIONS = {
    "remember_fact": call_remember_fact,
    "recall_facts": call_recall_fact,
    "search_teamcenter_item": call_teamcenter_search,
    "health_check": health_check
}

tools =[types.Tool(
    
    
        function_declarations=[
            types.FunctionDeclaration(
                name="remember_fact",
                description="Store an important user fact in backend memory.",
                parameters={
                    "type": "object",
                    "properties": {
                        "fact": {
                            "type": "string",
                            "description": "The fact to remember."
                        }
                    },
                    "required": ["fact"]
                }
            ),
            types.FunctionDeclaration(
                name="recall_facts",
                description="Retrieve saved user facts from backend memory.",
                parameters={
                    "type": "object",
                    "properties": {}
                }
            ),
            types.FunctionDeclaration(
                name="get_current_time",
                description="Get the current date and time from backend.",
                parameters={
                    "type": "object",
                    "properties": {}
                }
            ),
            types.FunctionDeclaration(
                name="search_teamcenter_item",
                description="Search mock Teamcenter item by item ID.",
                parameters={
                    "type": "object",
                    "properties": {
                        "item_id": {
                            "type": "string",
                            "description": "Teamcenter item ID, for example P-1001."
                        }
                    },
                    "required": ["item_id"]
                }
            )
        ]
    )]

config = types.GenerateContentConfig(
    tools=tools,
    system_instruction="""
You are a custom AI agent.

Rules:
1. If the user asks you to remember something, call remember_fact.
2. If the user asks what you remember, call recall_facts.
3. If the user asks for a health check, call health_check.
4. If the user asks about a Teamcenter item ID, call search_teamcenter_item.
5. After receiving backend tool results, explain the result clearly.
""")

chat = client.chats.create(model=model, config=config)


print("=" * 70)
print("Gemini Agent with Backend Tool Functions")
print("Type 'exit' to stop")
print("=" * 70)

while True:
    user_input = input("\nUser: ")

    if user_input.lower() in ["exit", "quit"]:
        print("\nAgent stopped.")
        break

    try:
        response = chat.send_message(user_input)

        if response.function_calls:
            for function_call in response.function_calls:
                tool_name = function_call.name
                tool_args = dict(function_call.args)

                print(f"\n[Gemini Selected Tool: {tool_name}]")
                print(f"[Arguments: {tool_args}]")

                if tool_name not in TOOL_FUNCTIONS:
                    tool_result = {
                        "error": f"Unknown tool: {tool_name}"
                    }
                else:
                    tool_result = TOOL_FUNCTIONS[tool_name](**tool_args)

                print(f"[Backend Result: {tool_result}]")

                final_response = chat.send_message(
                    types.Part.from_function_response(
                        name=tool_name,
                        response=tool_result
                    )
                )

                print("\nAssistant:")
                print(final_response.text)

        else:
            print("\nAssistant:")
            print(response.text)

    except Exception as e:
        print("\nError:", str(e))