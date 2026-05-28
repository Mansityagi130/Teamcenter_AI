from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..db import session
from ..dependencies import current_user_from_jwt
from ..services.chat_service import stream_chat_response

router = APIRouter(prefix="/chat", tags=["chat"])


class MessageIn(BaseModel):
    content: str


@router.get("/sessions")
def list_sessions(user_id: str = Depends(current_user_from_jwt)):
    with session() as conn:
        rows = conn.execute(
            "SELECT id, title, created_at, updated_at FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC",
            (user_id,),
        ).fetchall()
        return [dict(row) for row in rows]


@router.get("/sessions/{session_id}/messages")
def list_messages(session_id: str, user_id: str = Depends(current_user_from_jwt)):
    with session() as conn:
        rows = conn.execute(
            "SELECT id, role, content, input_tokens, output_tokens, created_at FROM messages WHERE session_id = ? AND user_id = ? ORDER BY created_at ASC",
            (session_id, user_id),
        ).fetchall()
        return [dict(row) for row in rows]


@router.post("/sessions/{session_id}/messages")
def send_message(session_id: str, payload: MessageIn, user_id: str = Depends(current_user_from_jwt)):
    async def event_stream():
        with session() as conn:
            async for chunk in stream_chat_response(conn, user_id, session_id, payload.content):
                yield chunk

    return StreamingResponse(event_stream(), media_type="text/event-stream")
