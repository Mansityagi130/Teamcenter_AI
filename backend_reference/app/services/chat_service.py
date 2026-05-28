import asyncio
from uuid import uuid4

from ..config import settings
from .mcp_service import mcp_service
from .token_service import assert_token_budget, record_token_usage


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


async def stream_chat_response(conn, user_id: str, session_id: str, user_text: str):
    input_tokens = estimate_tokens(user_text)
    assert_token_budget(conn, user_id, input_tokens + 512)

    user_message_id = str(uuid4())
    conn.execute(
        "INSERT INTO messages (id, session_id, user_id, role, content, input_tokens) VALUES (?, ?, ?, 'user', ?, ?)",
        (user_message_id, session_id, user_id, user_text, input_tokens),
    )

    tool_result = await mcp_service.maybe_call_tool(conn, user_id, session_id, user_text)
    response_text = f"I received: {user_text}"
    if tool_result:
        response_text += f"\nTool result: {tool_result}"

    assistant_message_id = str(uuid4())
    output_tokens = estimate_tokens(response_text)
    usage = record_token_usage(
        conn,
        user_id=user_id,
        session_id=session_id,
        message_id=assistant_message_id,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        model=settings.model_name,
    )
    conn.execute(
        "INSERT INTO messages (id, session_id, user_id, role, content, output_tokens) VALUES (?, ?, ?, 'assistant', ?, ?)",
        (assistant_message_id, session_id, user_id, response_text, output_tokens),
    )
    conn.execute("UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (session_id,))

    for word in response_text.split(" "):
        yield f"data: {word} \n\n"
        await asyncio.sleep(0.01)
    yield f"event: usage\ndata: {usage}\n\n"
