from fastapi import Header, HTTPException, status

from .db import session
from .security import decode_jwt, hash_api_key


def current_user_from_jwt(authorization: str = Header(..., alias="Authorization")) -> str:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth header")
    try:
        payload = decode_jwt(authorization.split(" ", 1)[1])
        return payload["sub"]
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")


def current_user_from_api_key(x_api_key: str = Header(..., alias="X-API-KEY")) -> str:
    key_hash = hash_api_key(x_api_key.strip())
    with session() as conn:
        row = conn.execute(
            "SELECT user_id FROM api_keys WHERE key_hash = ?",
            (key_hash,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
        conn.execute("UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE key_hash = ?", (key_hash,))
        return row["user_id"]
