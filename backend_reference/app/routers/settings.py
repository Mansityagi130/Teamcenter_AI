from fastapi import APIRouter, Depends

from ..db import session
from ..dependencies import current_user_from_jwt

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/profile")
def profile(user_id: str = Depends(current_user_from_jwt)):
    with session() as conn:
        user = conn.execute("SELECT id, email, display_name, created_at FROM users WHERE id = ?", (user_id,)).fetchone()
        key = conn.execute("SELECT key_prefix, version, last_used_at, created_at, rotated_at FROM api_keys WHERE user_id = ?", (user_id,)).fetchone()
        usage = conn.execute("SELECT tokens_used, token_limit, reset_at FROM user_daily_usage WHERE user_id = ?", (user_id,)).fetchone()
        return {"user": dict(user), "api_key": dict(key), "usage": dict(usage)}


@router.get("/activity")
def activity(user_id: str = Depends(current_user_from_jwt)):
    with session() as conn:
        token_rows = conn.execute(
            "SELECT total_tokens, input_tokens, output_tokens, model, created_at FROM token_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
            (user_id,),
        ).fetchall()
        activity_rows = conn.execute(
            "SELECT action, metadata_json, created_at FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
            (user_id,),
        ).fetchall()
        return {"token_logs": [dict(row) for row in token_rows], "activity_logs": [dict(row) for row in activity_rows]}
