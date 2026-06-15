import asyncio
import os
import sys
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def run_test():
    print("=== Teamcenter AI Copilot MCP Integration Test ===")

    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    # Initialize environment parameters matching a test user
    # We will point to port 8000 (which we assume is running or will run)
    server_params = StdioServerParameters(
        command=sys.executable,
        args=["mcp_server.py"],
        env={
            **os.environ,
            "BACKEND_URL": "http://127.0.0.1:8000",
            "BACKEND_API_KEY": "smoketest_key",  # Simulated test key
            "BACKEND_JWT": "smoketest_jwt",
        },
        cwd=project_root,
    )

    print("Launching MCP Server subprocess...")
    try:
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                print("Initializing ClientSession...")
                await session.initialize()

                # Test 1: Discover Tools
                print("\nTest 1: Tool Discovery")
                tools_result = await session.list_tools()
                discovered_tools = [tool.name for tool in tools_result.tools]
                print(f"Discovered {len(discovered_tools)} tools: {discovered_tools}")

                expected_tools = [
                    "search_items",
                    "get_item",
                    "create_item",
                    "update_item",
                    "delete_item",
                    "get_bom",
                    "expand_bom",
                    "create_workflow",
                    "approve_workflow",
                    "search_datasets",
                    "download_dataset",
                    "get_user_details",
                    "show_system_capabilities",
                ]

                missing = [t for t in expected_tools if t not in discovered_tools]
                if missing:
                    print(f"[FAIL] Missing expected tools: {missing}")
                    sys.exit(1)
                else:
                    print("[PASS] All expected tools discovered!")

                # Test 2: Input validation checking (run tool with invalid args)
                print("\nTest 2: Tool Validation Constraints")
                try:
                    res = await session.call_tool("search_items", arguments={})
                    # FastMCP validates arguments automatically and should raise an error or return error status
                    print(f"Empty arguments outcome: {res.content[0].text if res.content else 'No Content'}")
                except Exception as ex:
                    print(f"[PASS] Input validation successfully rejected call: {str(ex)}")

                print("\n=== Integration Test Configuration Completed ===")
    except Exception as e:
        # Avoid print exception containing unicode chars if any
        err_msg = str(e).encode("ascii", errors="ignore").decode("ascii")
        print(f"[FAIL] Exception during integration test: {err_msg}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(run_test())
