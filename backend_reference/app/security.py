import base64
import hashlib
import hmac
import secrets
import time
from datetime import datetime, timedelta
from typing import Any

from passlib.context import CryptContext

from .config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def generate_api_key() -> tuple[str, str, str]:
    raw_key = "ak_" + secrets.token_urlsafe(32)
    key_hash = hash_api_key(raw_key)
    key_prefix = raw_key[:10]
    return raw_key, key_hash, key_prefix


def hash_api_key(api_key: str) -> str:
    return hmac.new(
        settings.api_key_pepper.encode("utf-8"),
        api_key.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")


def create_jwt(subject: str) -> str:
    header = _b64(b'{"alg":"HS256","typ":"JWT"}')
    exp = int((datetime.utcnow() + timedelta(minutes=settings.jwt_exp_minutes)).timestamp())
    body = _b64(f'{{"sub":"{subject}","exp":{exp}}}'.encode("utf-8"))
    sig = hmac.new(settings.jwt_secret.encode("utf-8"), f"{header}.{body}".encode("utf-8"), hashlib.sha256).digest()
    return f"{header}.{body}.{_b64(sig)}"


def decode_jwt(token: str) -> dict[str, Any]:
    header, body, sig = token.split(".")
    expected = _b64(hmac.new(settings.jwt_secret.encode("utf-8"), f"{header}.{body}".encode("utf-8"), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        raise ValueError("Invalid token signature")
    payload = base64.urlsafe_b64decode(body + "=" * (-len(body) % 4))
    import json

    data = json.loads(payload)
    if int(data["exp"]) < int(time.time()):
        raise ValueError("Token expired")
    return data
