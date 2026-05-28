from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr

from ..db import session
from ..dependencies import current_user_from_jwt
from ..security import create_jwt, generate_api_key, hash_password, verify_password
from ..services.token_service import ensure_daily_usage

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    display_name: str | None = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


@router.post("/register")
def register(payload: RegisterIn):
    user_id = str(uuid4())
    raw_key, key_hash, key_prefix = generate_api_key()
    with session() as conn:
        existing = conn.execute("SELECT 1 FROM users WHERE email = ?", (payload.email.lower(),)).fetchone()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
        conn.execute(
            "INSERT INTO users (id, email, display_name, password_hash) VALUES (?, ?, ?, ?)",
            (user_id, payload.email.lower(), payload.display_name, hash_password(payload.password)),
        )
        conn.execute(
            "INSERT INTO api_keys (id, user_id, key_hash, key_prefix) VALUES (?, ?, ?, ?)",
            (str(uuid4()), user_id, key_hash, key_prefix),
        )
        ensure_daily_usage(conn, user_id)
    return {"access_token": create_jwt(user_id), "api_key": raw_key, "user_id": user_id}


@router.post("/login")
def login(payload: LoginIn):
    with session() as conn:
        user = conn.execute("SELECT * FROM users WHERE email = ?", (payload.email.lower(),)).fetchone()
        if user is None or not verify_password(payload.password, user["password_hash"]):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        chat_session_id = str(uuid4())
        conn.execute(
            "INSERT INTO chat_sessions (id, user_id) VALUES (?, ?)",
            (chat_session_id, user["id"]),
        )
    return {"access_token": create_jwt(user["id"]), "session_id": chat_session_id}


@router.post("/api-key/regenerate")
def regenerate_api_key(user_id: str = Depends(current_user_from_jwt)):
    raw_key, key_hash, key_prefix = generate_api_key()
    with session() as conn:
        conn.execute(
            """
            UPDATE api_keys
            SET key_hash = ?, key_prefix = ?, version = version + 1, rotated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
            """,
            (key_hash, key_prefix, user_id),
        )
    return {"api_key": raw_key, "key_prefix": key_prefix}
