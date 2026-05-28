from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException, status

from ..config import settings


def ensure_daily_usage(conn, user_id: str) -> None:
    today = datetime.utcnow().date().isoformat()
    reset_at = (datetime.utcnow() + timedelta(hours=24)).isoformat()
    row = conn.execute("SELECT user_id, usage_date FROM user_daily_usage WHERE user_id = ?", (user_id,)).fetchone()
    if row is None:
        conn.execute(
            "INSERT INTO user_daily_usage (user_id, usage_date, tokens_used, token_limit, reset_at) VALUES (?, ?, 0, ?, ?)",
            (user_id, today, settings.daily_token_limit, reset_at),
        )
    elif row["usage_date"] != today:
        conn.execute(
            "UPDATE user_daily_usage SET usage_date = ?, tokens_used = 0, reset_at = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
            (today, reset_at, user_id),
        )


def assert_token_budget(conn, user_id: str, estimated_tokens: int) -> dict:
    ensure_daily_usage(conn, user_id)
    row = conn.execute(
        "SELECT tokens_used, token_limit FROM user_daily_usage WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    remaining = row["token_limit"] - row["tokens_used"]
    if estimated_tokens > remaining:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily token limit reached. Try again after the next reset. Remaining tokens: {max(0, remaining)}.",
        )
    return {"used": row["tokens_used"], "limit": row["token_limit"], "remaining": remaining}


def record_token_usage(conn, user_id: str, session_id: str, message_id: str, input_tokens: int, output_tokens: int, model: str) -> dict:
    total = input_tokens + output_tokens
    ensure_daily_usage(conn, user_id)
    conn.execute(
        "UPDATE user_daily_usage SET tokens_used = tokens_used + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
        (total, user_id),
    )
    conn.execute(
        """
        INSERT INTO token_logs (id, user_id, session_id, message_id, input_tokens, output_tokens, total_tokens, model)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (str(uuid4()), user_id, session_id, message_id, input_tokens, output_tokens, total, model),
    )
    row = conn.execute("SELECT tokens_used, token_limit FROM user_daily_usage WHERE user_id = ?", (user_id,)).fetchone()
    return {"used": row["tokens_used"], "limit": row["token_limit"], "remaining": row["token_limit"] - row["tokens_used"]}
