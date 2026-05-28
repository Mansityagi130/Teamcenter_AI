import json
from uuid import uuid4


class McpService:
    """Thin MCP boundary.

    Replace the demo branches with real MCP ClientSession calls to your MCP server.
    Keep all tool credentials on the backend.
    """

    async def maybe_call_tool(self, conn, user_id: str, session_id: str, user_text: str) -> str | None:
        lowered = user_text.lower()
        if "health" in lowered:
            return await self._record(conn, user_id, session_id, "health_check", {}, {"status": "healthy"})
        if "list items" in lowered:
            return await self._record(conn, user_id, session_id, "list_items", {}, {"items": []})
        return None

    async def _record(self, conn, user_id: str, session_id: str, tool_name: str, args: dict, result: dict) -> str:
        conn.execute(
            """
            INSERT INTO mcp_tool_calls (id, user_id, session_id, tool_name, arguments_json, result_json, status)
            VALUES (?, ?, ?, ?, ?, ?, 'success')
            """,
            (str(uuid4()), user_id, session_id, tool_name, json.dumps(args), json.dumps(result)),
        )
        return json.dumps({"tool": tool_name, "result": result})


mcp_service = McpService()
