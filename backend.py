from dotenv import load_dotenv
import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import logging
import time
from pathlib import Path
from datetime import datetime, timedelta
from logging.handlers import RotatingFileHandler
from typing import Any, Dict, List, Optional
import re
import random

from pydantic import BaseModel, Field
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Form, status
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
import workflow

app = FastAPI()
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

# Configure CORS
allowed_origins_env = os.getenv("ALLOWED_ORIGINS")
if allowed_origins_env:
    origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]
    allow_credentials = True
else:
    origins = ["*"]
    allow_credentials = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Gemini
GEMINI_API_KEY = os.getenv("Gemini_API_Key") or os.getenv("Gemini_API_KEY")
GEMINI_MODEL = os.getenv("Gemini_Model_Name", "gemini-3-flash-preview")
gemini_client = None

def get_gemini_client(custom_key: Optional[str] = None):
    if custom_key:
        try:
            return genai.Client(api_key=custom_key)
        except Exception as e:
            logging.getLogger("teamcenter_backend").error(f"Failed to initialize custom Gemini client: {e}")
    global gemini_client
    if gemini_client is not None:
        return gemini_client
    key = os.getenv("Gemini_API_Key") or os.getenv("Gemini_API_KEY")
    if key:
        try:
            gemini_client = genai.Client(api_key=key)
            return gemini_client
        except Exception as e:
            logging.getLogger("teamcenter_backend").error(f"Failed to initialize Gemini client dynamically: {e}")
    return None

# Attempt initial setup
get_gemini_client()

def call_gemini_generate_content(*args, custom_key: Optional[str] = None, **kwargs):
    def run():
        client = get_gemini_client(custom_key=custom_key)
        if not client:
            raise Exception("Gemini client is not initialized")
        return client.models.generate_content(*args, **kwargs)
        
    max_retries = 3
    delay = 1.0
    backoff = 2.0
    curr_delay = delay
    last_err = None
    for attempt in range(max_retries):
        try:
            return run()
        except Exception as e:
            last_err = e
            logging.getLogger("teamcenter_backend").warning(
                f"Gemini call attempt {attempt + 1} failed: {e}. Retrying in {curr_delay}s..."
            )
            if not custom_key:
                global gemini_client
                gemini_client = None  # Force reconnection next time
            time.sleep(curr_delay)
            curr_delay *= backoff
    raise last_err


DATA_FILE = BASE_DIR / "data" / "items.csv"
if not DATA_FILE.exists():
    DATA_FILE = BASE_DIR / "Data" / "items.csv"
DB_FILE = Path(os.getenv("DATABASE_PATH", str(BASE_DIR / "teamcenter.db")))
FRONTEND_DIR = BASE_DIR / "frontend"
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)
LOG_FILE = LOG_DIR / "backend.log"

ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "replace-with-secure-admin-token")
SHOW_ADMIN_TOKEN_ON_SITE = os.getenv("SHOW_ADMIN_TOKEN_ON_SITE", "false").lower() == "true"
JWT_SECRET = os.getenv("JWT_SECRET", "change-me-please")
JWT_EXP_SECONDS = int(os.getenv("JWT_EXP_SECONDS", "3600"))
DEFAULT_CHAT_LIMIT = int(os.getenv("DEFAULT_CHAT_LIMIT", "500"))
DAILY_CHAT_LIMIT = int(os.getenv("DAILY_CHAT_LIMIT", "500"))
RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
RATE_LIMIT_MAX_REQUESTS = int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "20"))

logger = logging.getLogger("teamcenter_backend")
logger.setLevel(os.getenv("LOG_LEVEL", "INFO"))
file_handler = RotatingFileHandler(str(LOG_FILE), maxBytes=5_000_000, backupCount=3)
file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
logger.addHandler(file_handler)

if ADMIN_TOKEN == "replace-with-secure-admin-token":
    logger.warning(
        "ADMIN_TOKEN not set. Using default admin token. "
        "Set ADMIN_TOKEN in .env or environment for production."
    )

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=128)
    password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=128)
    password: str = Field(..., min_length=8, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    api_key: str
    token_type: str = "bearer"
    expires_in: int


class ApiKeyResponse(BaseModel):
    api_key: str


class ItemRequest(BaseModel):
    item_id: str
    item_name: Optional[str] = None
    item_description: Optional[str] = None
    revision_id: Optional[str] = None


class ItemUpdateRequest(BaseModel):
    item_id: str
    item_name: Optional[str] = None
    item_description: Optional[str] = None


class ItemDeleteRequest(BaseModel):
    item_id: str


class DatasetAddRequest(BaseModel):
    dataset_id: str
    dataset_name: str
    item_id: str


class DatasetUpdateRequest(BaseModel):
    dataset_id: str
    dataset_name: str


class DatasetDeleteRequest(BaseModel):
    dataset_id: str


class WorkflowAddRequest(BaseModel):
    workflow_id: str
    workflow_name: str
    item_id: str
    revision_id: str
    workflow_status: Optional[str] = "Draft"


class WorkflowUpdateRequest(BaseModel):
    workflow_id: str
    workflow_name: Optional[str] = None
    workflow_status: Optional[str] = None


class WorkflowDeleteRequest(BaseModel):
    workflow_id: str


class RevisionAddRequest(BaseModel):
    item_id: str
    revision_id: Optional[str] = None


class RevisionDeleteRequest(BaseModel):
    item_id: str
    revision_id: str


class UserDeleteRequest(BaseModel):
    username: str



class ListFilterRequest(BaseModel):
    item_id: Optional[str] = None




class ChatMessageRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    session_id: Optional[str] = Field(default="default")


class EditChatMessageRequest(BaseModel):
    message_id: int
    message: str = Field(..., min_length=1, max_length=2000)


class RenameSessionRequest(BaseModel):
    session_id: str
    title: str = Field(..., min_length=1, max_length=100)


class AdminResetRequest(BaseModel):
    user_id: str


class UserSettingsResponse(BaseModel):
    openai_key: str
    claude_key: str
    gemini_key: str
    tc_user: str
    tc_pass: str
    active_model: str
    active_env: str


class UserSettingsUpdateRequest(BaseModel):
    openai_key: Optional[str] = None
    claude_key: Optional[str] = None
    gemini_key: Optional[str] = None
    tc_user: Optional[str] = None
    tc_pass: Optional[str] = None
    active_model: Optional[str] = None
    active_env: Optional[str] = None


class ResetPasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ApiChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    model: str
    environment: str
    sessionId: str


class ApiChatResponse(BaseModel):
    reply: str
    toolCalls: List[Dict[str, Any]]
    metadata: Dict[str, Any]


def b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("utf-8")


def b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def hash_password(password: str, salt: Optional[bytes] = None) -> Dict[str, bytes]:
    if salt is None:
        salt = secrets.token_bytes(16)
    password_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000)
    return {"salt": salt, "hash": password_hash}


def verify_password(password: str, salt: bytes, stored_hash: bytes) -> bool:
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000)
    return hmac.compare_digest(candidate, stored_hash)


async def parse_auth_payload(
    request: Request,
    username: Optional[str] = Form(None),
    password: Optional[str] = Form(None),
) -> Dict[str, Optional[str]]:
    if username is not None and password is not None:
        return {"username": username, "password": password}

    try:
        body = await request.json()
    except json.JSONDecodeError:
        form = await request.form()
        return {"username": form.get("username"), "password": form.get("password")}

    return {"username": body.get("username"), "password": body.get("password")}


def generate_jwt(payload: Dict[str, str], expires_in: int = JWT_EXP_SECONDS) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    now = datetime.utcnow()
    body = {
        **payload,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=expires_in)).timestamp()),
    }
    header_b64 = b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    body_b64 = b64url_encode(json.dumps(body, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(JWT_SECRET.encode("utf-8"), f"{header_b64}.{body_b64}".encode("utf-8"), hashlib.sha256).digest()
    signature_b64 = b64url_encode(signature)
    return f"{header_b64}.{body_b64}.{signature_b64}"


def verify_jwt(token: str) -> Dict[str, str]:
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token format")
    header_b64, body_b64, signature_b64 = parts
    expected_signature = hmac.new(
        JWT_SECRET.encode("utf-8"),
        f"{header_b64}.{body_b64}".encode("utf-8"),
        hashlib.sha256,
    ).digest()
    if not hmac.compare_digest(b64url_decode(signature_b64), expected_signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token signature")
    payload = json.loads(b64url_decode(body_b64).decode("utf-8"))
    if int(payload.get("exp", 0)) < int(datetime.utcnow().timestamp()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired")
    return payload


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_FILE, detect_types=sqlite3.PARSE_DECLTYPES)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    with get_db_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                password_hash BLOB NOT NULL,
                password_salt BLOB NOT NULL,
                api_key TEXT UNIQUE,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_sessions (
                session_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(username) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                session_id TEXT NOT NULL DEFAULT 'default',
                sender TEXT NOT NULL,
                message TEXT NOT NULL,
                timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(username) ON DELETE CASCADE
            )
            """
        )
        # Auto-migration check: add session_id column if it is missing from an existing database
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(chat_messages)")
        columns = [row["name"] for row in cursor.fetchall()]
        if "session_id" not in columns:
            conn.execute("ALTER TABLE chat_messages ADD COLUMN session_id TEXT NOT NULL DEFAULT 'default'")
            conn.commit()
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS chat_usage (
                user_id TEXT PRIMARY KEY,
                message_count INTEGER NOT NULL DEFAULT 0,
                chat_limit INTEGER NOT NULL DEFAULT {DEFAULT_CHAT_LIMIT},
                updated_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(username) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_usage_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                message_count INTEGER NOT NULL,
                timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(username) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS activity_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                action TEXT NOT NULL,
                timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(username) ON DELETE CASCADE
            )
            """
        )
        
        # Ensure users table supports createdAt, updatedAt, createdBy
        cursor.execute("PRAGMA table_info(users)")
        user_cols = [row["name"] for row in cursor.fetchall()]
        if "createdAt" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN createdAt TEXT")
            conn.execute("UPDATE users SET createdAt = created_at WHERE createdAt IS NULL")
        if "updatedAt" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN updatedAt TEXT")
            conn.execute("UPDATE users SET updatedAt = created_at WHERE updatedAt IS NULL")
        if "createdBy" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN createdBy TEXT")

        # Ensure 'system' user exists to satisfy foreign key constraints
        cursor = conn.execute("SELECT 1 FROM users WHERE username = ?", ("system",))
        if cursor.fetchone() is None:
            now = datetime.utcnow().isoformat()
            password_data = hash_password(secrets.token_urlsafe(32))
            # Since create_unique_api_key might be defined later or needs transaction commit first:
            api_key = secrets.token_urlsafe(32)
            conn.execute(
                "INSERT INTO users (username, password_hash, password_salt, api_key, created_at, createdAt, updatedAt, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                ("system", password_data["hash"], password_data["salt"], api_key, now, now, now, None)
            )
            # Ensure chat_usage is also created
            conn.execute(
                "INSERT INTO chat_usage (user_id, message_count, chat_limit, updated_at) VALUES (?, ?, ?, ?)",
                ("system", 0, DEFAULT_CHAT_LIMIT, now)
            )

        # Create items table
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS items (
                item_id TEXT PRIMARY KEY,
                item_name TEXT,
                item_description TEXT,
                createdAt TEXT NOT NULL,
                updatedAt TEXT NOT NULL,
                createdBy TEXT,
                FOREIGN KEY(createdBy) REFERENCES users(username) ON DELETE SET NULL
            )
            """
        )

        # Create revisions table
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS revisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                revision_id TEXT NOT NULL,
                item_id TEXT NOT NULL,
                createdAt TEXT NOT NULL,
                updatedAt TEXT NOT NULL,
                createdBy TEXT,
                UNIQUE(item_id, revision_id),
                FOREIGN KEY(item_id) REFERENCES items(item_id) ON DELETE CASCADE,
                FOREIGN KEY(createdBy) REFERENCES users(username) ON DELETE SET NULL
            )
            """
        )

        # Create datasets table
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS datasets (
                dataset_id TEXT PRIMARY KEY,
                dataset_name TEXT NOT NULL,
                item_id TEXT NOT NULL,
                createdAt TEXT NOT NULL,
                updatedAt TEXT NOT NULL,
                createdBy TEXT,
                FOREIGN KEY(item_id) REFERENCES items(item_id) ON DELETE CASCADE,
                FOREIGN KEY(createdBy) REFERENCES users(username) ON DELETE SET NULL
            )
            """
        )

        # Create workflows table
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS workflows (
                workflow_id TEXT PRIMARY KEY,
                workflow_name TEXT NOT NULL,
                workflow_status TEXT NOT NULL DEFAULT 'Draft',
                revision_row_id INTEGER NOT NULL,
                createdAt TEXT NOT NULL,
                updatedAt TEXT NOT NULL,
                createdBy TEXT,
                FOREIGN KEY(revision_row_id) REFERENCES revisions(id) ON DELETE CASCADE,
                FOREIGN KEY(createdBy) REFERENCES users(username) ON DELETE SET NULL
            )
            """
        )
        # Create user_settings table
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id TEXT PRIMARY KEY,
                openai_key TEXT,
                claude_key TEXT,
                gemini_key TEXT,
                tc_user TEXT,
                tc_pass TEXT,
                active_model TEXT DEFAULT 'gemini',
                active_env TEXT DEFAULT 'dev',
                FOREIGN KEY(user_id) REFERENCES users(username) ON DELETE CASCADE
            )
            """
        )
        
        # Ensure a settings record exists for the 'system' user
        cursor = conn.execute("SELECT 1 FROM user_settings WHERE user_id = ?", ("system",))
        if cursor.fetchone() is None:
            conn.execute(
                "INSERT INTO user_settings (user_id, openai_key, claude_key, gemini_key, tc_user, tc_pass, active_model, active_env) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                ("system", "", "", "", "tc_admin_prod", "", "gemini", "dev")
            )
            
        conn.commit()

        # Perform CSV Data Migration
        csv_file = DATA_FILE
        if csv_file.exists():
            try:
                import csv
                with open(csv_file, mode="r", encoding="utf-8-sig") as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        item_id = (row.get("item_id") or "").strip()
                        if not item_id:
                            continue
                        item_name = (row.get("item_name") or "").strip()
                        item_description = (row.get("item_description") or "").strip()
                        revision_id = (row.get("revision_id") or "").strip() or "A"
                        
                        now = datetime.utcnow().isoformat()
                        
                        # Insert item if not exists
                        cursor = conn.execute("SELECT 1 FROM items WHERE item_id = ?", (item_id,))
                        if cursor.fetchone() is None:
                            conn.execute(
                                "INSERT INTO items (item_id, item_name, item_description, createdAt, updatedAt, createdBy) VALUES (?, ?, ?, ?, ?, ?)",
                                (item_id, item_name, item_description, now, now, "system")
                            )
                        
                        # Insert revision if not exists
                        cursor = conn.execute("SELECT 1 FROM revisions WHERE item_id = ? AND revision_id = ?", (item_id, revision_id))
                        if cursor.fetchone() is None:
                            conn.execute(
                                "INSERT INTO revisions (revision_id, item_id, createdAt, updatedAt, createdBy) VALUES (?, ?, ?, ?, ?)",
                                (revision_id, item_id, now, now, "system")
                            )
                conn.commit()
                bak_file = csv_file.with_suffix(".csv.bak")
                if not bak_file.exists():
                    csv_file.rename(bak_file)
                else:
                    csv_file.unlink()
                logger.info("Migrated CSV data to SQLite successfully and archived the CSV file.")
            except Exception as e:
                logger.error(f"Failed to migrate CSV: {e}")



def init_data_file() -> None:
    workflow.init_data_file()





def normalize_item_id(item_id: str) -> str:
    return item_id.strip()


def create_unique_api_key(conn: sqlite3.Connection) -> str:
    while True:
        api_key = secrets.token_urlsafe(32)
        existing = conn.execute("SELECT 1 FROM users WHERE api_key = ?", (api_key,)).fetchone()
        if existing is None:
            return api_key


def ensure_user_api_key(conn: sqlite3.Connection, username: str) -> str:
    row = conn.execute("SELECT api_key FROM users WHERE username = ?", (username,)).fetchone()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if row["api_key"]:
        return row["api_key"]
    api_key = create_unique_api_key(conn)
    conn.execute("UPDATE users SET api_key = ? WHERE username = ?", (api_key, username))
    conn.commit()
    return api_key


def extract_bearer_token(authorization: str = Header(..., alias="Authorization")) -> str:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authorization header")
    return authorization.split(" ", 1)[1].strip()


def get_current_user(authorization: str = Depends(extract_bearer_token)) -> str:
    payload = verify_jwt(authorization)
    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    return username


def get_authenticated_user_id(x_api_key: str = Header(..., alias="X-API-Key")) -> str:
    api_key = x_api_key.strip()
    if not api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing X-API-Key header")
    with get_db_connection() as conn:
        row = conn.execute("SELECT username FROM users WHERE api_key = ?", (api_key,)).fetchone()
        if row is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
        return row["username"]


def get_admin_token(x_admin_token: str = Header(..., alias="X-Admin-Token")) -> str:
    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid admin token")
    return x_admin_token


def log_user_activity(conn: sqlite3.Connection, user_id: str, endpoint: str, action: str) -> None:
    conn.execute(
        "INSERT INTO activity_logs (user_id, endpoint, action, timestamp) VALUES (?, ?, ?, ?)",
        (user_id, endpoint, action, datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")),
    )
    conn.commit()


def get_user_24h_usage(conn: sqlite3.Connection, user_id: str) -> int:
    row = conn.execute(
        "SELECT COALESCE(SUM(message_count), 0) AS total FROM chat_usage_history WHERE user_id = ? AND timestamp >= datetime('now', '-24 hours')",
        (user_id,),
    ).fetchone()
    return row["total"] if row else 0


def record_chat_usage(conn: sqlite3.Connection, user_id: str, message_count: int = 1) -> int:
    conn.execute(
        "INSERT INTO chat_usage_history (user_id, message_count, timestamp) VALUES (?, ?, ?)",
        (user_id, message_count, datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")),
    )
    conn.commit()
    return get_user_24h_usage(conn, user_id)


def clear_user_recent_chat_usage(conn: sqlite3.Connection, user_id: str) -> None:
    conn.execute(
        "DELETE FROM chat_usage_history WHERE user_id = ? AND timestamp >= datetime('now', '-24 hours')",
        (user_id,),
    )
    conn.commit()


def ensure_user_record(conn: sqlite3.Connection, user_id: str) -> None:
    """Ensure a chat_usage row and a user_settings row exist for the given user.

    Creates an initial row with zero usage and default settings when none exist.
    """
    row = conn.execute("SELECT 1 FROM chat_usage WHERE user_id = ?", (user_id,)).fetchone()
    if row is None:
        conn.execute(
            "INSERT INTO chat_usage (user_id, message_count, chat_limit, updated_at) VALUES (?, ?, ?, ?)",
            (user_id, 0, DAILY_CHAT_LIMIT, datetime.utcnow().isoformat()),
        )
        conn.commit()

    settings_row = conn.execute("SELECT 1 FROM user_settings WHERE user_id = ?", (user_id,)).fetchone()
    if settings_row is None:
        conn.execute(
            "INSERT INTO user_settings (user_id, openai_key, claude_key, gemini_key, tc_user, tc_pass, active_model, active_env) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (user_id, "", "", "", "tc_admin_prod", "", "gemini", "dev")
        )
        conn.commit()


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    init_data_file()


@app.get("/", response_class=HTMLResponse)
def frontend() -> str:
    index_file = FRONTEND_DIR / "index.html"
    if not index_file.exists():
        return "<h1>Teamcenter backend is running</h1><p>Frontend files were not found.</p>"
    return index_file.read_text(encoding="utf-8")


@app.post("/signup")
@app.post("/register")
async def register(
    request: Request,
    auth_data: Dict[str, Optional[str]] = Depends(parse_auth_payload),
) -> Dict[str, str]:
    username = (auth_data.get("username") or "").strip().lower()
    password = auth_data.get("password") or ""
    if not username or not password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username and password are required")

    password_data = hash_password(password)
    created_at = datetime.utcnow().isoformat()
    try:
        with get_db_connection() as conn:
            api_key = create_unique_api_key(conn)
            conn.execute(
                "INSERT INTO users (username, password_hash, password_salt, api_key, created_at) VALUES (?, ?, ?, ?, ?)",
                (username, password_data["hash"], password_data["salt"], api_key, created_at),
            )
            conn.commit()
            ensure_user_record(conn, username)
    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already signed up with this username. Please login instead.",
        )
    return {"message": "User registered successfully", "api_key": api_key}


@app.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    auth_data: Dict[str, Optional[str]] = Depends(parse_auth_payload),
) -> TokenResponse:
    username = (auth_data.get("username") or "").strip().lower()
    password = auth_data.get("password") or ""
    if not username or not password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username and password are required")

    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT password_hash, password_salt FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No account found for this username. Please signup first.",
            )
        if not verify_password(password, row["password_salt"], row["password_hash"]):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        api_key = ensure_user_api_key(conn, username)

    token = generate_jwt({"sub": username})
    return TokenResponse(access_token=token, api_key=api_key, expires_in=JWT_EXP_SECONDS)


@app.post("/generate-api-key", response_model=ApiKeyResponse)
def generate_api_key(current_user: str = Depends(get_current_user)) -> ApiKeyResponse:
    with get_db_connection() as conn:
        api_key = ensure_user_api_key(conn, current_user)
        log_user_activity(conn, current_user, "/generate-api-key", "show_existing_api_key")
    return ApiKeyResponse(api_key=api_key)


# --- Intelligent Response System Extension ---

TEAMCENTER_KEYWORDS = {
    "teamcenter", "plm", "siemens", "iman", "grm", "bom", "dataset", "lov", "bmide", 
    "item revision", "release status", "workflow handler", "dispatcher", "soa", "itk", 
    "rac", "active workspace", "query builder", "tccs", "fcc", "tcserver", "pom", 
    "tc_profilevars", "rich client", "awc", "plmxml", "structure manager", "access manager",
    "organization", "handler", "workflow"
}

CODING_KEYWORDS = {
    "python", "javascript", "java", "c++", "html", "css", "sql", "programming", "code",
    "write a function", "debug", "error", "compile", "git", "docker", "api", "database",
    "algorithm", "function", "class", "react", "fastapi", "rest api"
}

CASUAL_PRESETS = {
    "hello": "Hey! What's up?",
    "hi": "Hey there! How can I help you today?",
    "hey": "Hey! How’s it going?",
    "good morning": "Good morning! Hope you're having a great day.",
    "good afternoon": "Good afternoon! How can I help you today?",
    "good evening": "Good evening! What can I do for you tonight?",
    "good night": "Good night! Sleep well and see you next time.",
    "how are you": "I'm doing great! How can I help you today?",
    "who are you": "I am the Teamcenter AI assistant. I can help you with Siemens Teamcenter/PLM questions, write and debug code, or just have a casual conversation!",
    "what can you do": "I can assist you with Teamcenter PLM concepts, manage items (add, list, search), write or debug general programming code, or just chat with you!",
    "thank you": "You’re welcome!",
    "thanks": "You’re welcome!",
    "tell me a joke": "Why do programmers wear glasses? Because they can't C#! 😄",
    "cool": "Awesome! Let me know if there's anything else you'd like to work on.",
    "ok": "Got it! Let me know what we should do next.",
    "okay": "Got it! Let me know what we should do next.",
    "great": "Glad to hear that! What's our next step?",
    "awesome": "Thanks! How can I help you from here?",
    "yes": "Sure, what would you like me to do?",
    "no": "No problem. Let me know if there is anything else you need.",
    "nice": "Great! Let me know what you'd like to do next.",
    "sure": "Alright, tell me what you'd like to do.",
    "wow": "Haha, glad I could surprise you! Let me know what we should do next.",
    "perfect": "Excellent! Let me know if you need anything else.",
    "fine": "Glad to hear that. What's on your mind?",
    "good": "That’s great to hear!",
    "bye": "Goodbye! Have a great day.",
    "what's up": "Not much! How can I help you today?",
    "whats up": "Not much! How can I help you today?"
}

CASUAL_SYSTEM_INSTRUCTION = (
    "You are a friendly, natural, and helpful AI assistant. You are capable of casual chat, "
    "answering general coding questions, and helping with Siemens Teamcenter PLM.\n"
    "Rules:\n"
    "1. Respond naturally to greetings, small talk, jokes, and gratitude.\n"
    "2. Keep your responses short, conversational, and warm.\n"
    "3. Support multiple tones depending on the user's message (e.g., if they are casual, be casual; "
    "if they are formal, be professional).\n"
    "4. Avoid sounding robotic, repetitive, or using unnecessary lists.\n"
    "5. Be polite and human-like."
)

TEAMCENTER_SYSTEM_INSTRUCTION = (
    "You are an expert Siemens Teamcenter PLM technical assistant and educational advisor.\n"
    "Rules:\n"
    "1. Provide accurate, clear, and educational answers related to Teamcenter and PLM concepts "
    "(such as IMAN specification, GRM relation, workflows, BOM structure, Dataset, LOV, Access Manager, "
    "BMIDE, Item Revision, Release Status, Workflow handlers, Dispatcher, SOA, ITK, RAC, Active Workspace, Query Builder).\n"
    "2. Explain concepts clearly, providing a definition and at least one real-world or practical example.\n"
    "3. Support beginner-friendly explanations and maintain a conversational, encouraging tone.\n"
    "4. Answer viva/interview-style questions when prompted, giving structured but accessible answers.\n"
    "5. Keep responses concise unless the user explicitly asks for a detailed explanation.\n"
    "6. You have access to Teamcenter tools. Use add_item_tool when user asks to add an item, "
    "list_items_tool for listing items, search_item_tool for searching, get_user_details_tool for user profile, "
    "and show_system_capabilities_tool for system features."
)

CODING_SYSTEM_INSTRUCTION = (
    "You are a highly skilled software engineer and coding assistant.\n"
    "Rules:\n"
    "1. Answer programming, database, and general software engineering questions clearly and accurately.\n"
    "2. Write clean, well-commented code snippets in appropriate languages inside markdown code blocks.\n"
    "3. Help debug errors and explain the root cause of programming bugs.\n"
    "4. Keep explanations concise and focused.\n"
    "5. You have access to get_user_details_tool and show_system_capabilities_tool if requested."
)

UNKNOWN_SYSTEM_INSTRUCTION = (
    "You are a specialized AI assistant. You can only assist with:\n"
    "1. Casual greetings and small talk.\n"
    "2. Siemens Teamcenter & PLM technical concepts.\n"
    "3. General coding and programming questions.\n\n"
    "Rules:\n"
    "1. Politely inform the user that their query is outside your current scope of assistance.\n"
    "2. Briefly specify what you CAN help with (casual chat, Teamcenter PLM, coding).\n"
    "3. Ask how they would like to proceed or suggest a related topic they could ask about.\n"
    "4. Keep the response friendly, polite, and brief."
)

def get_canonical_intent(message_text: str) -> Tuple[Optional[str], dict]:
    msg_lower = message_text.lower().strip()
    msg_clean = re.sub(r'[^\w\s\'\"]', ' ', msg_lower).strip()
    words = msg_clean.split()
    
    syn_actions = {
        "LIST": ["list", "show", "display", "get", "view", "print"],
        "SEARCH": ["find", "search", "locate", "query"],
        "DELETE": ["remove", "delete", "destroy", "discard"],
        "UPDATE": ["edit", "modify", "update", "change"],
        "ADD": ["add", "create", "new", "insert"]
    }
    
    syn_targets = {
        "ITEM": ["item", "items", "part", "parts"],
        "DATASET": ["dataset", "datasets", "file", "files"],
        "REVISION": ["revision", "revisions", "rev", "revs"],
        "WORKFLOW": ["workflow", "workflows", "wf", "process"],
        "USER": ["user", "users", "member", "members"],
        "PROFILE": ["profile", "details"],
        "HELP": ["help", "capabilities", "features", "commands", "mcp tools"]
    }
    
    def has_action(action_name):
        return any(syn in words for syn in syn_actions[action_name])
        
    def has_target(target_name):
        for syn in syn_targets[target_name]:
            if syn in words:
                return True
            if len(syn.split()) > 1 and syn in msg_clean:
                return True
        return False

    if any(p in msg_clean for p in ["existing items", "created items", "item list", "items list", "list of items"]):
        return "LIST_ITEMS_INTENT", {}

    if any(p in msg_clean for p in ["user details", "my details", "profile details"]):
        return "PROFILE_INTENT", {}

    if any(p in msg_clean for p in ["mcp tools", "system capabilities", "system features"]):
        return "FEATURES_INTENT", {}

    # UPDATE ITEM
    for act_syn in syn_actions["UPDATE"]:
        for tgt_syn in syn_targets["ITEM"]:
            pattern = rf"\b{act_syn}\s+{tgt_syn}\s+([A-Za-z0-9_-]+)(.*)"
            match = re.search(pattern, msg_clean)
            if match:
                item_id = match.group(1).upper()
                rest = match.group(2)
                name_match = re.search(r"name\s+['\"]([^'\"]+)['\"]", rest)
                desc_match = re.search(r"desc\s+['\"]([^'\"]+)['\"]", rest)
                if not name_match and not desc_match:
                    name_match = re.search(r"name\s+(\S+)", rest)
                    desc_match = re.search(r"desc\s+(\S+)", rest)
                
                return "UPDATE_ITEM_INTENT", {
                    "item_id": item_id,
                    "item_name": name_match.group(1) if name_match else None,
                    "item_description": desc_match.group(1) if desc_match else None
                }

    # ADD DATASET
    for act_syn in syn_actions["ADD"]:
        for tgt_syn in syn_targets["DATASET"]:
            pattern = rf"\b{act_syn}\s+{tgt_syn}\s+(\S+)\s+name\s+['\"]([^'\"]+)['\"]\s+(?:item|part)\s+(\S+)"
            match = re.search(pattern, msg_lower)
            if not match:
                pattern = rf"\b{act_syn}\s+{tgt_syn}\s+(\S+)\s+name\s+(\S+)\s+(?:item|part)\s+(\S+)"
                match = re.search(pattern, msg_lower)
            if match:
                return "ADD_DATASET_INTENT", {
                    "dataset_id": match.group(1).upper(),
                    "dataset_name": match.group(2),
                    "item_id": match.group(3).upper()
                }
            if re.search(rf"\b{act_syn}\s+{tgt_syn}\b", msg_clean):
                return "ADD_DATASET_INTENT", {}

    # ADD REVISION
    for act_syn in syn_actions["ADD"]:
        for tgt_syn in syn_targets["REVISION"]:
            pattern = rf"\b{act_syn}\s+{tgt_syn}\s+(\S+)\s+(?:item|part)\s+(\S+)"
            match = re.search(pattern, msg_clean)
            if match:
                return "ADD_REVISION_INTENT", {
                    "revision_id": match.group(1).upper(),
                    "item_id": match.group(2).upper()
                }
            pattern2 = rf"\b{act_syn}\s+{tgt_syn}\s+(?:item|part)\s+(\S+)"
            match2 = re.search(pattern2, msg_clean)
            if match2:
                return "ADD_REVISION_INTENT", {
                    "revision_id": None,
                    "item_id": match2.group(1).upper()
                }
            if re.search(rf"\b{act_syn}\s+{tgt_syn}\b", msg_clean):
                return "ADD_REVISION_INTENT", {}

    # ADD WORKFLOW
    for act_syn in syn_actions["ADD"]:
        for tgt_syn in syn_targets["WORKFLOW"]:
            pattern = rf"\b{act_syn}\s+{tgt_syn}\s+(\S+)\s+name\s+['\"]([^'\"]+)['\"]\s+(?:item|part)\s+(\S+)\s+(?:revision|rev)\s+(\S+)"
            match = re.search(pattern, msg_lower)
            if not match:
                pattern = rf"\b{act_syn}\s+{tgt_syn}\s+(\S+)\s+name\s+(\S+)\s+(?:item|part)\s+(\S+)\s+(?:revision|rev)\s+(\S+)"
                match = re.search(pattern, msg_lower)
            if match:
                return "ADD_WORKFLOW_INTENT", {
                    "workflow_id": match.group(1).upper(),
                    "workflow_name": match.group(2),
                    "item_id": match.group(3).upper(),
                    "revision_id": match.group(4).upper()
                }
            if re.search(rf"\b{act_syn}\s+{tgt_syn}\b", msg_clean):
                return "ADD_WORKFLOW_INTENT", {}

    # LIST ITEMS (with Field-Aware check)
    if has_target("ITEM"):
        has_list = has_action("LIST")
        is_short = (len(words) <= 3 and not any(has_action(a) for a in ["ADD", "DELETE", "UPDATE", "SEARCH"]))
        
        if has_list or is_short:
            requested_field = None
            if any(w in words for w in ["name", "names"]):
                requested_field = "name"
            elif any(w in words for w in ["id", "ids"]):
                requested_field = "id"
            elif any(w in words for w in ["description", "descriptions", "desc", "descs"]):
                requested_field = "description"
            elif any(w in words for w in ["revision", "revisions", "rev", "revs"]):
                requested_field = "revision"
            elif any(w in words for w in ["dataset", "datasets", "file", "files"]):
                requested_field = "dataset"
            elif any(w in words for w in ["workflow", "workflows", "wf", "wfs", "process", "processes"]):
                requested_field = "workflow"
            elif any(w in words for w in ["date", "dates", "created"]):
                requested_field = "created_date"
            
            if requested_field is not None or (not has_target("REVISION") and not has_target("DATASET") and not has_target("WORKFLOW")):
                item_match = re.search(r"(?:item|part)\s+(\S+)", msg_clean)
                has_specific_id = False
                if item_match:
                    pot_id = item_match.group(1)
                    if pot_id not in {"names", "name", "ids", "id", "descriptions", "description", "desc", "descs", "revisions", "revision", "rev", "revs", "datasets", "dataset", "workflows", "workflow", "wf", "wfs", "process", "processes", "date", "dates", "created"}:
                        has_specific_id = True
                
                if not has_specific_id:
                    return "LIST_ITEMS_INTENT", {"requested_field": requested_field}

    # LIST DATASETS
    if has_action("LIST") and has_target("DATASET"):
        item_match = re.search(r"(?:item|part)\s+(\S+)", msg_clean)
        return "LIST_DATASETS_INTENT", {
            "item_id": item_match.group(1).upper() if item_match else None
        }

    # LIST REVISIONS
    if has_action("LIST") and has_target("REVISION"):
        item_match = re.search(r"(?:item|part)\s+(\S+)", msg_clean)
        return "LIST_REVISIONS_INTENT", {
            "item_id": item_match.group(1).upper() if item_match else None
        }

    # LIST WORKFLOWS
    if has_action("LIST") and has_target("WORKFLOW"):
        item_match = re.search(r"(?:item|part)\s+(\S+)", msg_clean)
        return "LIST_WORKFLOWS_INTENT", {
            "item_id": item_match.group(1).upper() if item_match else None
        }

    # DELETE USER / SEARCH USER / LIST USERS
    if has_target("USER"):
        if has_action("DELETE"):
            for act_syn in syn_actions["DELETE"]:
                for tgt_syn in syn_targets["USER"]:
                    pattern = rf"\b{act_syn}\s+{tgt_syn}\s+(\S+)"
                    match = re.search(pattern, msg_clean)
                    if match:
                        return "DELETE_USER_INTENT", {"username": match.group(1)}
            return "DELETE_USER_INTENT", {"username": words[-1] if len(words) > 2 else None}
        elif has_action("SEARCH"):
            for act_syn in syn_actions["SEARCH"]:
                for tgt_syn in syn_targets["USER"]:
                    pattern = rf"\b{act_syn}\s+{tgt_syn}\s+(\S+)"
                    match = re.search(pattern, msg_clean)
                    if match:
                        return "SEARCH_USER_INTENT", {"username": match.group(1)}
            return "SEARCH_USER_INTENT", {"username": words[-1] if len(words) > 2 else None}
        elif has_action("LIST"):
            return "LIST_USERS_INTENT", {}

    # ADD ITEM
    for act_syn in syn_actions["ADD"]:
        for tgt_syn in syn_targets["ITEM"]:
            pattern = rf"\b{act_syn}\s+{tgt_syn}\s+(\S+)"
            match = re.search(pattern, msg_clean)
            if match:
                return "ADD_ITEM_INTENT", {"item_id": match.group(1).upper()}
            pattern_no_id = rf"\b{act_syn}\s+{tgt_syn}\b"
            if re.search(pattern_no_id, msg_clean):
                return "ADD_ITEM_INTENT", {"item_id": None}

    # DELETE ITEM
    for act_syn in syn_actions["DELETE"]:
        for tgt_syn in syn_targets["ITEM"]:
            pattern = rf"\b{act_syn}\s+{tgt_syn}\s+(\S+)"
            match = re.search(pattern, msg_clean)
            if match:
                return "DELETE_ITEM_INTENT", {"item_id": match.group(1).upper()}

    # SEARCH ITEM
    if has_action("SEARCH"):
        for act_syn in syn_actions["SEARCH"]:
            for tgt_syn in syn_targets["ITEM"]:
                pattern = rf"\b{act_syn}\s+{tgt_syn}\s+(\S+)"
                match = re.search(pattern, msg_clean)
                if match:
                    return "SEARCH_ITEM_INTENT", {"item_id": match.group(1).upper()}
        if len(words) >= 2:
            return "SEARCH_ITEM_INTENT", {"item_id": words[-1].upper()}

    # PROFILE
    if has_target("PROFILE") or "profile" in words:
        return "PROFILE_INTENT", {}

    # HELP / FEATURES
    if has_target("HELP") or any(w in words for w in ["help", "features", "capabilities", "commands"]):
        return "FEATURES_INTENT", {}

    return None, {}

def detect_intent(message_text: str, history: List[Any]) -> str:
    msg_clean = re.sub(r'[^\w\s]', '', message_text.lower()).strip()
    words = set(msg_clean.split())
    
    # Fallback protection: prefer Teamcenter/database routing if key entities are present
    entities = {
        "item", "items", "part", "parts",
        "dataset", "datasets", "file", "files",
        "workflow", "workflows", "wf", "process",
        "revision", "revisions", "rev", "revs",
        "user", "users", "member", "members"
    }
    if any(ent in words for ent in entities):
        return "teamcenter_technical"
        
    # 1. Exact preset keys check
    if msg_clean in CASUAL_PRESETS:
        return "casual"
        
    # 2. Check keywords in the current message
    words = set(msg_clean.split())
    
    has_tc = any((kw in msg_clean if len(kw) > 4 else kw in words) for kw in TEAMCENTER_KEYWORDS)
    for short_tc in ["itk", "rac", "lov", "bom", "soa", "grm", "awc", "fcc", "pom", "plm"]:
        if short_tc in words:
            has_tc = True
            
    has_code = any((kw in msg_clean if len(kw) > 3 else kw in words) for kw in CODING_KEYWORDS)
    for short_code in ["sql", "git", "api", "css", "js", "cpp"]:
        if short_code in words:
            has_code = True

    if any(cmd in msg_clean for cmd in ["add item", "item list", "list items", "search item", "find item"]):
        has_tc = True

    if has_tc and not has_code:
        return "teamcenter_technical"
    if has_code and not has_tc:
        return "general_coding"
        
    # Check for casual keywords
    CASUAL_KEYWORDS = {
        "hello", "hi", "hey", "good morning", "good afternoon", "good evening", 
        "how are you", "who are you", "what can you do", "thank you", "thanks", 
        "tell me a joke", "joke", "how's it going", "what's up", "nice to meet you",
        "greetings", "bye", "goodbye", "goodmorning", "goodevening", "goodafternoon",
        "whats up", "cool", "ok", "okay", "great", "awesome", "yes", "no", "nice",
        "sure", "wow", "perfect", "fine", "good night", "goodnight", "good", "bye"
    }
    has_casual = any((kw in msg_clean if len(kw) > 3 else kw in words) for kw in CASUAL_KEYWORDS)
    if has_casual:
        return "casual"
        
    # 3. Context inheritance: Check previous messages in the current session
    if history:
        for row in reversed(history):
            prev_msg = row["message"].lower()
            prev_clean = re.sub(r'[^\w\s]', '', prev_msg).strip()
            prev_words = set(prev_clean.split())
            
            prev_has_tc = any((kw in prev_clean if len(kw) > 4 else kw in prev_words) for kw in TEAMCENTER_KEYWORDS) or any(cmd in prev_clean for cmd in ["add item", "item list", "list items", "search item", "find item"])
            for short_tc in ["itk", "rac", "lov", "bom", "soa", "grm", "awc", "fcc", "pom", "plm"]:
                if short_tc in prev_words:
                    prev_has_tc = True
            
            prev_has_code = any((kw in prev_clean if len(kw) > 3 else kw in prev_words) for kw in CODING_KEYWORDS)
            for short_code in ["sql", "git", "api", "css", "js", "cpp"]:
                if short_code in prev_words:
                    prev_has_code = True
                    
            if prev_has_tc and not prev_has_code:
                return "teamcenter_technical"
            if prev_has_code and not prev_has_tc:
                return "general_coding"
                
    # 4. Fallback: Ask Gemini to classify
    if get_gemini_client():
        try:
            classification_prompt = (
                f"Classify the intent of the following user message into exactly one of these categories: 'casual', 'teamcenter_technical', 'general_coding', or 'unknown'.\n"
                f"Do not return any other text. Follow the descriptions:\n"
                f"- 'casual': greetings, small talk, jokes, thanking, general questions about bot identity/capabilities.\n"
                f"- 'teamcenter_technical': Siemens Teamcenter, PLM, BMIDE, workflows, database items, active workspace, RAC, itk, soa, etc.\n"
                f"- 'general_coding': programming, general coding questions, writing code, databases, debugging, etc.\n"
                f"- 'unknown': any unrelated topics (e.g. recipes, sports, history, weather, movies, shopping, etc.)\n\n"
                f"User Message: \"{message_text}\""
            )
            response = call_gemini_generate_content(
                model=GEMINI_MODEL,
                contents=classification_prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=IntentResponse,
                    temperature=0.0
                )
            )
            data = json.loads(response.text)
            detected = data.get("intent", "unknown")
            if detected in {"casual", "teamcenter_technical", "general_coding", "unknown"}:
                return detected
        except Exception as e:
            logger.error(f"Error detecting intent using Gemini: {e}")
            
    return "unknown"


def generate_and_save_response(
    conn,
    user_id: str,
    session_id: str,
    user_message_id: int,
    message_text: str,
    model: Optional[str] = None,
    environment: Optional[str] = None,
    executed_tools: Optional[List[Dict[str, Any]]] = None
) -> Tuple[str, int]:
    # Define internal tools inside helper to capture context (like user_id)
    def add_item_tool(item_id: str, item_name: Optional[str] = "", item_description: Optional[str] = "", revision_id: Optional[str] = "A") -> str:
        """Adds a new item to Teamcenter database.
        
        Args:
            item_id: The ID of the item to add.
            item_name: The name of the item.
            item_description: A description of the item.
            revision_id: Custom revision ID (defaults to 'A').
        """
        try:
            normalized = normalize_item_id(item_id)
            if not normalized:
                return "Error: Item ID is required."
            with get_db_connection() as conn:
                row = conn.execute("SELECT 1 FROM items WHERE item_id = ?", (normalized,)).fetchone()
                if row is not None:
                    return f"Error: Item {normalized} already exists."
            
            workflow.save_item_to_csv(
                item_id=normalized,
                item_name=item_name or "",
                item_description=item_description or "",
                revision_id=revision_id or "A",
                created_by=user_id
            )
            with get_db_connection() as c:
                log_user_activity(c, user_id, "/item/add", f"chat_add_item:{normalized}")
            return "success"
        except Exception as e:
            return f"Error: {str(e)}"

    def update_item_tool(item_id: str, item_name: Optional[str] = None, item_description: Optional[str] = None) -> str:
        """Updates an existing item's name or description.
        
        Args:
            item_id: The ID of the item to update.
            item_name: New name for the item.
            item_description: New description for the item.
        """
        try:
            normalized = normalize_item_id(item_id)
            if not normalized:
                return "Error: Item ID is required."
            now = datetime.utcnow().isoformat()
            with get_db_connection() as c:
                row = c.execute("SELECT 1 FROM items WHERE item_id = ?", (normalized,)).fetchone()
                if not row:
                    return f"Error: Item '{normalized}' not found."
                
                updates = []
                params = []
                if item_name is not None:
                    updates.append("item_name = ?")
                    params.append(item_name)
                if item_description is not None:
                    updates.append("item_description = ?")
                    params.append(item_description)
                
                if updates:
                    updates.append("updatedAt = ?")
                    params.append(now)
                    params.append(normalized)
                    query = f"UPDATE items SET {', '.join(updates)} WHERE item_id = ?"
                    c.execute(query, tuple(params))
                    c.commit()
                    log_user_activity(c, user_id, "/item/update", f"chat_update_item:{normalized}")
            return "success"
        except Exception as e:
            return f"Error: {str(e)}"

    def delete_item_tool(item_id: str) -> str:
        """Deletes an item and all its associated datasets, revisions, and workflows.
        
        Args:
            item_id: The ID of the item to delete.
        """
        try:
            normalized = normalize_item_id(item_id)
            with get_db_connection() as c:
                row = c.execute("SELECT 1 FROM items WHERE item_id = ?", (normalized,)).fetchone()
                if not row:
                    return f"Error: Item '{normalized}' not found."
                c.execute("DELETE FROM items WHERE item_id = ?", (normalized,))
                c.commit()
                log_user_activity(c, user_id, "/item/delete", f"chat_delete_item:{normalized}")
            return "success"
        except Exception as e:
            return f"Error: {str(e)}"

    def list_items_tool(requested_field: Optional[str] = None) -> str:
        """Lists all items in Teamcenter with dynamic field selection."""
        import random
        try:
            with get_db_connection() as conn:
                log_user_activity(conn, user_id, "/item/list", f"chat_list_items:{requested_field or 'all'}")
                
                # Fetch all items and their joined relations
                cursor = conn.execute(
                    """
                    SELECT i.item_id, i.item_name, i.item_description, i.createdAt,
                           GROUP_CONCAT(r.revision_id) as revisions,
                           GROUP_CONCAT(d.dataset_id) as datasets,
                           GROUP_CONCAT(w.workflow_id) as workflows
                    FROM items i
                    LEFT JOIN revisions r ON i.item_id = r.item_id
                    LEFT JOIN datasets d ON i.item_id = d.item_id
                    LEFT JOIN revisions r2 ON i.item_id = r2.item_id
                    LEFT JOIN workflows w ON r2.id = w.revision_row_id
                    GROUP BY i.item_id
                    ORDER BY i.item_id ASC
                    """
                )
                rows = cursor.fetchall()
                
            if not rows:
                return "No items found in the system."
                
            if requested_field == "id":
                lines = []
                for i, r in enumerate(rows, 1):
                    lines.append(f"{i}. {r['item_id']}")
                headers = [
                    "Item IDs:\n",
                    "Here are the item IDs currently stored in Teamcenter:\n",
                    "I found these item IDs in the system:\n",
                    "These are the item IDs available:\n"
                ]
                return random.choice(headers) + "\n".join(lines)
                
            elif requested_field == "name":
                lines = []
                for i, r in enumerate(rows, 1):
                    name = r['item_name'] or "N/A"
                    lines.append(f"{i}. {name}")
                headers = [
                    "Item Names:\n",
                    "Here are the names of the items:\n",
                    "I retrieved these item names from the database:\n",
                    "These are the registered item names:\n"
                ]
                return random.choice(headers) + "\n".join(lines)
                
            elif requested_field == "description":
                lines = []
                for i, r in enumerate(rows, 1):
                    desc = r['item_description'] or "N/A"
                    lines.append(f"{i}. {desc}")
                headers = [
                    "Item Descriptions:\n",
                    "Here are the item descriptions:\n",
                    "I found these descriptions for the items:\n",
                    "Here is a list of item descriptions:\n"
                ]
                return random.choice(headers) + "\n".join(lines)
                
            elif requested_field == "revision":
                lines = []
                for i, r in enumerate(rows, 1):
                    revs = r['revisions']
                    if revs:
                        revs_list = sorted(list(set(x.strip() for x in revs.split(",") if x.strip())))
                        revs_display = ", ".join(revs_list)
                    else:
                        revs_display = "N/A"
                    lines.append(f"{i}. {r['item_id']}: {revs_display}")
                headers = [
                    "Item Revisions:\n",
                    "Here are the revisions associated with each item:\n",
                    "These revisions exist in the system:\n",
                    "Current item revisions list:\n"
                ]
                return random.choice(headers) + "\n".join(lines)
                
            elif requested_field == "dataset":
                lines = []
                for i, r in enumerate(rows, 1):
                    dss = r['datasets']
                    if dss:
                        dss_list = sorted(list(set(x.strip() for x in dss.split(",") if x.strip())))
                        dss_display = ", ".join(dss_list)
                    else:
                        dss_display = "No datasets"
                    lines.append(f"{i}. {r['item_id']}: {dss_display}")
                headers = [
                    "Item Datasets:\n",
                    "Here are the datasets linked to each item:\n",
                    "I found these datasets in the system:\n",
                    "Linked datasets overview:\n"
                ]
                return random.choice(headers) + "\n".join(lines)
                
            elif requested_field == "workflow":
                lines = []
                for i, r in enumerate(rows, 1):
                    wfs = r['workflows']
                    if wfs:
                        wfs_list = sorted(list(set(x.strip() for x in wfs.split(",") if x.strip())))
                        wfs_display = ", ".join(wfs_list)
                    else:
                        wfs_display = "No workflows"
                    lines.append(f"{i}. {r['item_id']}: {wfs_display}")
                headers = [
                    "Item Workflows:\n",
                    "Here are the workflows associated with each item:\n",
                    "I found these active workflows in the system:\n",
                    "Item workflows list:\n"
                ]
                return random.choice(headers) + "\n".join(lines)
                
            elif requested_field == "created_date":
                lines = []
                for i, r in enumerate(rows, 1):
                    created = r['createdAt'] or "N/A"
                    lines.append(f"{i}. {r['item_id']}: {created}")
                headers = [
                    "Item Created Dates:\n",
                    "Here are the creation dates for the items:\n",
                    "These items were created at the following times:\n",
                    "Registered creation dates:\n"
                ]
                return random.choice(headers) + "\n".join(lines)
                
            else:
                # Default behavior: Item ID, Item Name, Revision
                lines = []
                for i, r in enumerate(rows, 1):
                    revs = r['revisions']
                    rev_display = "A"
                    if revs:
                        revs_list = sorted(list(set(x.strip() for x in revs.split(",") if x.strip())))
                        if revs_list:
                            rev_display = revs_list[-1]
                    lines.append(f"{i}. {r['item_id']} - {r['item_name'] or 'N/A'} (Revision: {rev_display})")
                headers = [
                    "Items Overview:\n",
                    "Here is a summary of the items in the system:\n",
                    "I found these items in the Teamcenter database:\n",
                    "Here are the available items:\n",
                    "These items currently exist:\n"
                ]
                return random.choice(headers) + "\n".join(lines)
        except Exception as e:
            return f"Error: {str(e)}"

    def search_item_tool(item_id: str) -> str:
        """Searches for a specific item in Teamcenter by its ID.
        
        Args:
            item_id: The ID of the item to search for.
        """
        try:
            normalized = normalize_item_id(item_id)
            with get_db_connection() as c:
                log_user_activity(c, user_id, "/item/search", f"chat_search_item:{normalized}")
                row = c.execute("SELECT 1 FROM items WHERE item_id = ?", (normalized,)).fetchone()
            if row is not None:
                return f"Item {normalized} exists in Teamcenter."
            else:
                return f"Item {normalized} was not found."
        except Exception as e:
            return f"Error: {str(e)}"

    def add_dataset_tool(dataset_id: str, dataset_name: str, item_id: str) -> str:
        """Adds a new dataset linked to an item.
        
        Args:
            dataset_id: Unique ID for the dataset.
            dataset_name: Name of the dataset.
            item_id: ID of the item this dataset belongs to.
        """
        try:
            ds_id = dataset_id.strip()
            ds_name = dataset_name.strip()
            normalized_item = normalize_item_id(item_id)
            if not ds_id or not ds_name or not normalized_item:
                return "Error: dataset_id, dataset_name, and item_id are all required."
            now = datetime.utcnow().isoformat()
            with get_db_connection() as c:
                item = c.execute("SELECT 1 FROM items WHERE item_id = ?", (normalized_item,)).fetchone()
                if not item:
                    return f"Error: Item '{normalized_item}' not found."
                existing = c.execute("SELECT 1 FROM datasets WHERE dataset_id = ?", (ds_id,)).fetchone()
                if existing:
                    return f"Error: Dataset '{ds_id}' already exists."
                c.execute(
                    "INSERT INTO datasets (dataset_id, dataset_name, item_id, createdAt, updatedAt, createdBy) VALUES (?, ?, ?, ?, ?, ?)",
                    (ds_id, ds_name, normalized_item, now, now, user_id)
                )
                c.commit()
                log_user_activity(c, user_id, "/dataset/add", f"chat_add_dataset:{ds_id}")
            return "success"
        except Exception as e:
            return f"Error: {str(e)}"

    def update_dataset_tool(dataset_id: str, dataset_name: str) -> str:
        """Updates the name of an existing dataset.
        
        Args:
            dataset_id: ID of the dataset to update.
            dataset_name: New name for the dataset.
        """
        try:
            ds_id = dataset_id.strip()
            ds_name = dataset_name.strip()
            if not ds_id or not ds_name:
                return "Error: dataset_id and dataset_name are required."
            now = datetime.utcnow().isoformat()
            with get_db_connection() as c:
                existing = c.execute("SELECT 1 FROM datasets WHERE dataset_id = ?", (ds_id,)).fetchone()
                if not existing:
                    return f"Error: Dataset '{ds_id}' not found."
                c.execute("UPDATE datasets SET dataset_name = ?, updatedAt = ? WHERE dataset_id = ?", (ds_name, now, ds_id))
                c.commit()
                log_user_activity(c, user_id, "/dataset/update", f"chat_update_dataset:{ds_id}")
            return "success"
        except Exception as e:
            return f"Error: {str(e)}"

    def delete_dataset_tool(dataset_id: str) -> str:
        """Deletes a dataset.
        
        Args:
            dataset_id: ID of the dataset to delete.
        """
        try:
            ds_id = dataset_id.strip()
            if not ds_id:
                return "Error: dataset_id is required."
            with get_db_connection() as c:
                existing = c.execute("SELECT 1 FROM datasets WHERE dataset_id = ?", (ds_id,)).fetchone()
                if not existing:
                    return f"Error: Dataset '{ds_id}' not found."
                c.execute("DELETE FROM datasets WHERE dataset_id = ?", (ds_id,))
                c.commit()
                log_user_activity(c, user_id, "/dataset/delete", f"chat_delete_dataset:{ds_id}")
            return "success"
        except Exception as e:
            return f"Error: {str(e)}"

    def list_datasets_tool(item_id: Optional[str] = None) -> str:
        """Lists datasets, optionally filtered by item ID.
        
        Args:
            item_id: Optional item ID to filter datasets.
        """
        try:
            with get_db_connection() as c:
                if item_id:
                    normalized = normalize_item_id(item_id)
                    rows = c.execute("SELECT * FROM datasets WHERE item_id = ?", (normalized,)).fetchall()
                else:
                    rows = c.execute("SELECT * FROM datasets").fetchall()
            if not rows:
                return "No datasets found."
            lines = []
            for r in rows:
                lines.append(f"- ID: {r['dataset_id']}, Name: {r['dataset_name']}, Item: {r['item_id']}")
            return "Datasets:\n" + "\n".join(lines)
        except Exception as e:
            return f"Error: {str(e)}"

    def add_revision_tool(item_id: str, revision_id: Optional[str] = None) -> str:
        """Adds a new revision for an item. If revision_id is not specified, auto-generates the next in sequence.
        
        Args:
            item_id: Item ID.
            revision_id: Optional custom revision ID (e.g. A, B, 001).
        """
        try:
            normalized = normalize_item_id(item_id)
            now = datetime.utcnow().isoformat()
            with get_db_connection() as c:
                item = c.execute("SELECT 1 FROM items WHERE item_id = ?", (normalized,)).fetchone()
                if not item:
                    return f"Error: Item '{normalized}' not found."
                rev = revision_id.strip() if revision_id else workflow.get_next_revision_id(c, normalized)
                existing = c.execute("SELECT 1 FROM revisions WHERE item_id = ? AND revision_id = ?", (normalized, rev)).fetchone()
                if existing:
                    return f"Error: Revision '{rev}' already exists for item '{normalized}'."
                c.execute(
                    "INSERT INTO revisions (revision_id, item_id, createdAt, updatedAt, createdBy) VALUES (?, ?, ?, ?, ?)",
                    (rev, normalized, now, now, user_id)
                )
                c.commit()
                log_user_activity(c, user_id, "/revision/add", f"chat_add_revision:{normalized}:{rev}")
            return f"success: revision '{rev}' created"
        except Exception as e:
            return f"Error: {str(e)}"

    def delete_revision_tool(item_id: str, revision_id: str) -> str:
        """Deletes a revision.
        
        Args:
            item_id: Item ID.
            revision_id: Revision ID to delete.
        """
        try:
            normalized = normalize_item_id(item_id)
            rev = revision_id.strip()
            with get_db_connection() as c:
                existing = c.execute("SELECT 1 FROM revisions WHERE item_id = ? AND revision_id = ?", (normalized, rev)).fetchone()
                if not existing:
                    return f"Error: Revision '{rev}' of item '{normalized}' not found."
                c.execute("DELETE FROM revisions WHERE item_id = ? AND revision_id = ?", (normalized, rev))
                c.commit()
                log_user_activity(c, user_id, "/revision/delete", f"chat_delete_revision:{normalized}:{rev}")
            return "success"
        except Exception as e:
            return f"Error: {str(e)}"

    def list_revisions_tool(item_id: Optional[str] = None) -> str:
        """Lists revisions, optionally filtered by item ID.
        
        Args:
            item_id: Optional item ID to filter revisions.
        """
        try:
            with get_db_connection() as c:
                if item_id:
                    normalized = normalize_item_id(item_id)
                    rows = c.execute("SELECT * FROM revisions WHERE item_id = ?", (normalized,)).fetchall()
                else:
                    rows = c.execute("SELECT * FROM revisions").fetchall()
            if not rows:
                return "No revisions found."
            lines = []
            for r in rows:
                lines.append(f"- Item: {r['item_id']}, Revision ID: {r['revision_id']}, Created: {r['createdAt']}")
            return "Revisions:\n" + "\n".join(lines)
        except Exception as e:
            return f"Error: {str(e)}"

    def add_workflow_tool(workflow_id: str, workflow_name: str, item_id: str, revision_id: str, workflow_status: Optional[str] = "Draft") -> str:
        """Adds a workflow process for an item revision.
        
        Args:
            workflow_id: Unique ID for the workflow.
            workflow_name: Name of the workflow.
            item_id: Item ID.
            revision_id: Revision ID of the item.
            workflow_status: Status (defaults to 'Draft').
        """
        try:
            wf_id = workflow_id.strip()
            wf_name = workflow_name.strip()
            normalized = normalize_item_id(item_id)
            rev = revision_id.strip()
            status_str = workflow_status.strip() if workflow_status else "Draft"
            if not wf_id or not wf_name or not normalized or not rev:
                return "Error: workflow_id, workflow_name, item_id, and revision_id are required."
            now = datetime.utcnow().isoformat()
            with get_db_connection() as c:
                rev_row = c.execute("SELECT id FROM revisions WHERE item_id = ? AND revision_id = ?", (normalized, rev)).fetchone()
                if not rev_row:
                    return f"Error: Revision '{rev}' of item '{normalized}' not found."
                existing = c.execute("SELECT 1 FROM workflows WHERE workflow_id = ?", (wf_id,)).fetchone()
                if existing:
                    return f"Error: Workflow '{wf_id}' already exists."
                c.execute(
                    "INSERT INTO workflows (workflow_id, workflow_name, workflow_status, revision_row_id, createdAt, updatedAt, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (wf_id, wf_name, status_str, rev_row["id"], now, now, user_id)
                )
                c.commit()
                log_user_activity(c, user_id, "/workflow/add", f"chat_add_workflow:{wf_id}")
            return "success"
        except Exception as e:
            return f"Error: {str(e)}"

    def update_workflow_tool(workflow_id: str, workflow_name: Optional[str] = None, workflow_status: Optional[str] = None) -> str:
        """Updates workflow name or status.
        
        Args:
            workflow_id: ID of the workflow to update.
            workflow_name: Optional new name.
            workflow_status: Optional new status.
        """
        try:
            wf_id = workflow_id.strip()
            if not wf_id:
                return "Error: workflow_id is required."
            now = datetime.utcnow().isoformat()
            with get_db_connection() as c:
                existing = c.execute("SELECT 1 FROM workflows WHERE workflow_id = ?", (wf_id,)).fetchone()
                if not existing:
                    return f"Error: Workflow '{wf_id}' not found."
                updates = []
                params = []
                if workflow_name is not None:
                    updates.append("workflow_name = ?")
                    params.append(workflow_name.strip())
                if workflow_status is not None:
                    updates.append("workflow_status = ?")
                    params.append(workflow_status.strip())
                if updates:
                    updates.append("updatedAt = ?")
                    params.append(now)
                    params.append(wf_id)
                    query = f"UPDATE workflows SET {', '.join(updates)} WHERE workflow_id = ?"
                    c.execute(query, tuple(params))
                    c.commit()
                    log_user_activity(c, user_id, "/workflow/update", f"chat_update_workflow:{wf_id}")
            return "success"
        except Exception as e:
            return f"Error: {str(e)}"

    def delete_workflow_tool(workflow_id: str) -> str:
        """Deletes a workflow process.
        
        Args:
            workflow_id: ID of the workflow to delete.
        """
        try:
            wf_id = workflow_id.strip()
            with get_db_connection() as c:
                existing = c.execute("SELECT 1 FROM workflows WHERE workflow_id = ?", (wf_id,)).fetchone()
                if not existing:
                    return f"Error: Workflow '{wf_id}' not found."
                c.execute("DELETE FROM workflows WHERE workflow_id = ?", (wf_id,))
                c.commit()
                log_user_activity(c, user_id, "/workflow/delete", f"chat_delete_workflow:{wf_id}")
            return "success"
        except Exception as e:
            return f"Error: {str(e)}"

    def list_workflows_tool(item_id: Optional[str] = None) -> str:
        """Lists workflows, optionally filtered by item ID.
        
        Args:
            item_id: Optional item ID to filter workflows.
        """
        try:
            with get_db_connection() as c:
                if item_id:
                    normalized = normalize_item_id(item_id)
                    rows = c.execute(
                        "SELECT w.*, r.revision_id, r.item_id FROM workflows w JOIN revisions r ON w.revision_row_id = r.id WHERE r.item_id = ?",
                        (normalized,)
                    ).fetchall()
                else:
                    rows = c.execute(
                        "SELECT w.*, r.revision_id, r.item_id FROM workflows w JOIN revisions r ON w.revision_row_id = r.id"
                    ).fetchall()
            if not rows:
                return "No workflows found."
            lines = []
            for r in rows:
                lines.append(f"- ID: {r['workflow_id']}, Name: {r['workflow_name']}, Status: {r['workflow_status']}, Item: {r['item_id']}, Rev: {r['revision_id']}")
            return "Workflows:\n" + "\n".join(lines)
        except Exception as e:
            return f"Error: {str(e)}"

    def search_user_tool(username: str) -> str:
        """Searches for a user.
        
        Args:
            username: The username to search.
        """
        try:
            target = username.strip().lower()
            with get_db_connection() as c:
                row = c.execute("SELECT username, createdAt FROM users WHERE username = ?", (target,)).fetchone()
            if not row:
                return f"User '{username}' not found."
            return f"User details:\n- Username: {row['username']}\n- Created: {row['createdAt']}"
        except Exception as e:
            return f"Error: {str(e)}"

    def delete_user_tool(username: str) -> str:
        """Deletes a user.
        
        Args:
            username: Username of the user to delete.
        """
        try:
            target = username.strip().lower()
            if target == "system":
                return "Error: Cannot delete the system user."
            with get_db_connection() as c:
                row = c.execute("SELECT 1 FROM users WHERE username = ?", (target,)).fetchone()
                if not row:
                    return f"Error: User '{username}' not found."
                c.execute("DELETE FROM users WHERE username = ?", (target,))
                c.commit()
            return "success"
        except Exception as e:
            return f"Error: {str(e)}"

    def list_users_tool() -> str:
        """Lists all registered users."""
        try:
            with get_db_connection() as c:
                rows = c.execute("SELECT username, createdAt FROM users").fetchall()
            if not rows:
                return "No users found."
            lines = []
            for r in rows:
                lines.append(f"- Username: {r['username']}, Joined: {r['createdAt']}")
            return "Users:\n" + "\n".join(lines)
        except Exception as e:
            return f"Error: {str(e)}"

    def get_user_details_tool() -> str:
        """Retrieves the current user's profile and system details (excluding private fields)."""
        try:
            with get_db_connection() as c:
                user_row = c.execute("SELECT username, api_key, created_at FROM users WHERE username = ?", (user_id,)).fetchone()
                usage_row = c.execute("SELECT message_count, chat_limit FROM chat_usage WHERE user_id = ?", (user_id,)).fetchone()
            if not user_row:
                return "Error: User details not found."
            api_key = user_row["api_key"] or "No API Key"
            created_at = user_row["created_at"]
            message_count = usage_row["message_count"] if usage_row else 0
            chat_limit = usage_row["chat_limit"] if usage_row else 500
            return (
                f"User Profile Details:\n"
                f"- Username: {user_row['username']}\n"
                f"- Account Created At: {created_at}\n"
                f"- Assigned API Key: {api_key}\n"
                f"- Chat Messages Sent Today: {message_count}\n"
                f"- Daily Chat Limit: {chat_limit}\n"
                f"- Role: Standard User"
            )
        except Exception as e:
            return f"Error: {str(e)}"

    def show_system_capabilities_tool() -> str:
        """Lists the system features, user details access, and available tools."""
        return (
            "I am a friendly and intelligent Teamcenter AI assistant designed to help you interact with Siemens Teamcenter PLM and general coding topics naturally.\n\n"
            "Here are the capabilities I can assist you with:\n"
            "- **Item & Revision Management**: I can create new items, search for existing items, list items, and update details or delete items in the database.\n"
            "- **Data Structures**: I can add, list, or delete Datasets, Item Revisions, and Workflows associated with items.\n"
            "- **Profile & Session details**: I can show you your profile details, persistent API keys, and daily token usage.\n"
            "- **General Assistance**: I can also help with programming concepts, general software engineering, and write code snippets.\n\n"
            "Feel free to ask me to perform any of these tasks or ask questions about Siemens Teamcenter PLM!"
        )

    # Intercept with interactive workflow engine (strictly local, gemini_client=None)
    wf_response, wf_active = workflow.handle_workflow_message(
        session_id=session_id,
        user_id=user_id,
        message=message_text,
        gemini_client=None,
        gemini_model=GEMINI_MODEL
    )
    if wf_response:
        cursor = conn.execute(
            "INSERT INTO chat_messages (user_id, session_id, sender, message, timestamp) VALUES (?, ?, 'assistant', ?, ?)",
            (user_id, session_id, wf_response, datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")),
        )
        conn.commit()
        return wf_response, cursor.lastrowid

    # Retrieve recent chat history for context (last 20 messages) inside the active session
    history_rows = conn.execute(
        "SELECT sender, message FROM chat_messages WHERE user_id = ? AND session_id = ? AND id < ? ORDER BY id DESC LIMIT 20",
        (user_id, session_id, user_message_id)
    ).fetchall()
    history_rows = list(reversed(history_rows))

    # Clean current message
    msg_clean = re.sub(r'[^\w\s]', '', message_text.lower()).strip()
    msg_lower = message_text.lower()

    # Detect intent
    intent = detect_intent(message_text, history_rows)
    logger.info(f"User {user_id} in session {session_id} message intent: {intent}")

    # PRIORITY 1: Local greetings & casual presets (100% local, never reach Gemini API)
    if intent == "casual" and msg_clean in CASUAL_PRESETS:
        ai_response_text = CASUAL_PRESETS[msg_clean]
        cursor = conn.execute(
            "INSERT INTO chat_messages (user_id, session_id, sender, message, timestamp) VALUES (?, ?, 'assistant', ?, ?)",
            (user_id, session_id, ai_response_text, datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")),
        )
        conn.commit()
        return ai_response_text, cursor.lastrowid
    elif intent == "casual":
        ai_response_text = "I'm here and ready to assist you! What's on your mind today?"
        cursor = conn.execute(
            "INSERT INTO chat_messages (user_id, session_id, sender, message, timestamp) VALUES (?, ?, 'assistant', ?, ?)",
            (user_id, session_id, ai_response_text, datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")),
        )
        conn.commit()
        return ai_response_text, cursor.lastrowid

    # PRIORITY 2, 3, 4: CRUD workflows, Local database operations, Teamcenter Knowledge base, profile queries (100% local, never reach Gemini API)
    ai_response_text = ""
    local_def = workflow.get_local_teamcenter_definition(message_text)
    
    canonical_intent, intent_params = get_canonical_intent(message_text)
    is_local_cmd = (canonical_intent is not None) or (local_def is not None)

    if is_local_cmd:
        if canonical_intent == "UPDATE_ITEM_INTENT":
            item_id = intent_params.get("item_id")
            item_name = intent_params.get("item_name")
            item_description = intent_params.get("item_description")
            if item_id:
                ai_response_text = update_item_tool(item_id, item_name, item_description)
            else:
                ai_response_text = "Error: Please specify the item ID to update (e.g. 'update item ABC name \"New Name\"')."
        elif canonical_intent == "ADD_DATASET_INTENT":
            dataset_id = intent_params.get("dataset_id")
            dataset_name = intent_params.get("dataset_name")
            item_id = intent_params.get("item_id")
            if dataset_id and dataset_name and item_id:
                ai_response_text = add_dataset_tool(dataset_id, dataset_name, item_id)
            else:
                ai_response_text = "Error format. Use: add dataset [dataset_id] name \"[dataset_name]\" item [item_id]"
        elif canonical_intent == "ADD_REVISION_INTENT":
            revision_id = intent_params.get("revision_id")
            item_id = intent_params.get("item_id")
            if item_id:
                ai_response_text = add_revision_tool(item_id, revision_id)
            else:
                ai_response_text = "Error format. Use: add revision [rev_id] item [item_id] OR add revision item [item_id]"
        elif canonical_intent == "ADD_WORKFLOW_INTENT":
            workflow_id = intent_params.get("workflow_id")
            workflow_name = intent_params.get("workflow_name")
            item_id = intent_params.get("item_id")
            revision_id = intent_params.get("revision_id")
            if workflow_id and workflow_name and item_id and revision_id:
                ai_response_text = add_workflow_tool(workflow_id, workflow_name, item_id, revision_id)
            else:
                ai_response_text = "Error format. Use: add workflow [workflow_id] name \"[workflow_name]\" item [item_id] revision [revision_id]"
        elif canonical_intent == "LIST_DATASETS_INTENT":
            item_id = intent_params.get("item_id")
            ai_response_text = list_datasets_tool(item_id)
        elif canonical_intent == "LIST_WORKFLOWS_INTENT":
            item_id = intent_params.get("item_id")
            ai_response_text = list_workflows_tool(item_id)
        elif canonical_intent == "LIST_REVISIONS_INTENT":
            item_id = intent_params.get("item_id")
            ai_response_text = list_revisions_tool(item_id)
        elif canonical_intent == "LIST_USERS_INTENT":
            ai_response_text = list_users_tool()
        elif canonical_intent == "SEARCH_USER_INTENT":
            username = intent_params.get("username")
            if username:
                ai_response_text = search_user_tool(username)
            else:
                ai_response_text = "Error: Please specify the username to search (e.g. 'search user admin')."
        elif canonical_intent == "DELETE_USER_INTENT":
            username = intent_params.get("username")
            if username:
                ai_response_text = delete_user_tool(username)
            else:
                ai_response_text = "Error: Please specify the username to delete (e.g. 'delete user testuser')."
        elif canonical_intent == "ADD_ITEM_INTENT":
            item_id = intent_params.get("item_id")
            if item_id:
                ai_response_text = add_item_tool(item_id)
            else:
                ai_response_text = "Error: Please specify the item ID to add (e.g. 'add item ABC')."
        elif canonical_intent == "DELETE_ITEM_INTENT":
            item_id = intent_params.get("item_id")
            if item_id:
                ai_response_text = delete_item_tool(item_id)
            else:
                ai_response_text = "Error: Please specify the item ID to delete (e.g. 'delete item ABC')."
        elif canonical_intent == "LIST_ITEMS_INTENT":
            requested_field = intent_params.get("requested_field")
            ai_response_text = list_items_tool(requested_field)
        elif canonical_intent == "SEARCH_ITEM_INTENT":
            item_id = intent_params.get("item_id")
            if item_id:
                ai_response_text = search_item_tool(item_id)
            else:
                ai_response_text = "Error: Please specify the item ID to search (e.g. 'search item ABC')."
        elif canonical_intent == "PROFILE_INTENT":
            ai_response_text = get_user_details_tool()
        elif canonical_intent == "FEATURES_INTENT":
            ai_response_text = show_system_capabilities_tool()
        elif local_def:
            ai_response_text = local_def

        cursor = conn.execute(
            "INSERT INTO chat_messages (user_id, session_id, sender, message, timestamp) VALUES (?, ?, 'assistant', ?, ?)",
            (user_id, session_id, ai_response_text, datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")),
        )
        conn.commit()
        return ai_response_text, cursor.lastrowid

    # PRIORITY 5: Gemini AI fallback only if truly needed
    gemini_error_type = None
    if get_gemini_client():
        try:
            # Prepare contents list
            contents = []
            for row in history_rows:
                role = "user" if row["sender"] == "user" else "model"
                contents.append(
                    types.Content(
                        role=role,
                        parts=[types.Part(text=row["message"])]
                    )
                )
            # Append current user message
            contents.append(
                types.Content(
                    role="user",
                    parts=[types.Part(text=message_text)]
                )
            )

            def wrap_tool(func):
                import functools
                @functools.wraps(func)
                def wrapper(*args, **kwargs):
                    import inspect
                    sig = inspect.signature(func)
                    bound = sig.bind_partial(*args, **kwargs)
                    bound.apply_defaults()
                    arguments = dict(bound.arguments)
                    result = func(*args, **kwargs)
                    if executed_tools is not None:
                        executed_tools.append({
                            "name": func.__name__,
                            "parameters": {k: str(v) for k, v in arguments.items()},
                            "result": str(result)
                        })
                    return result
                return wrapper

            # Determine system prompt and tools based on intent
            raw_tools = []
            if intent == "teamcenter_technical":
                system_instruction = TEAMCENTER_SYSTEM_INSTRUCTION
                raw_tools = [
                    add_item_tool, update_item_tool, delete_item_tool, list_items_tool, search_item_tool,
                    add_dataset_tool, update_dataset_tool, delete_dataset_tool, list_datasets_tool,
                    add_revision_tool, delete_revision_tool, list_revisions_tool,
                    add_workflow_tool, update_workflow_tool, delete_workflow_tool, list_workflows_tool,
                    search_user_tool, delete_user_tool, list_users_tool,
                    get_user_details_tool, show_system_capabilities_tool
                ]
            elif intent == "general_coding":
                system_instruction = CODING_SYSTEM_INSTRUCTION
                raw_tools = [get_user_details_tool, show_system_capabilities_tool]
            elif intent == "casual":
                system_instruction = CASUAL_SYSTEM_INSTRUCTION
                raw_tools = [get_user_details_tool, show_system_capabilities_tool]
            else:  # unknown / unsupported
                system_instruction = UNKNOWN_SYSTEM_INSTRUCTION
                raw_tools = []

            # Simulate alternative models by adjusting system prompt
            if model and model != "gemini":
                model_name_map = {
                    "gpt4": "GPT-4 Turbo",
                    "claude": "Claude 3.5 Sonnet",
                    "local": "Local Llama 3 (8B)"
                }
                disp_name = model_name_map.get(model, model)
                system_instruction += f"\n\n[SYSTEM NOTE: You are simulating {disp_name}. Reply in the tone and style of {disp_name}. Keep all Teamcenter functionality and responses precise and valid.]"

            tools = [wrap_tool(t) for t in raw_tools]

            # Look up custom Gemini key for the user
            custom_gemini_key = None
            with get_db_connection() as c_db:
                sett_row = c_db.execute("SELECT gemini_key FROM user_settings WHERE user_id = ?", (user_id,)).fetchone()
                if sett_row and sett_row["gemini_key"] and not sett_row["gemini_key"].startswith("gem-ai-"):
                    custom_gemini_key = sett_row["gemini_key"].strip()
                    if not custom_gemini_key:
                        custom_gemini_key = None

            config = types.GenerateContentConfig(
                tools=tools,
                system_instruction=system_instruction,
                temperature=0.4 if intent == "casual" else 0.2
            )

            response = call_gemini_generate_content(
                model=GEMINI_MODEL,
                contents=contents,
                config=config,
                custom_key=custom_gemini_key
            )
            ai_response_text = response.text or ""
        except Exception as gemini_err:
            logger.error(f"Gemini generation error: {gemini_err}")
            ai_response_text = None
            gemini_error_type = str(gemini_err)
    else:
        gemini_error_type = "no_client"

    if not ai_response_text:
        # Silently handle Gemini exceptions and return a conversational natural reply (masking technical errors/quota limits).
        import random
        natural_fallbacks = [
            "I'm still here and ready to help. Let's continue.",
            "I'm here and ready to assist you. What can I do for you next?",
            "Let's continue. Please let me know what you need.",
            "I am ready to help. What would you like to explore next?"
        ]
        ai_response_text = random.choice(natural_fallbacks)

    # Save assistant response to DB
    cursor = conn.execute(
        "INSERT INTO chat_messages (user_id, session_id, sender, message, timestamp) VALUES (?, ?, 'assistant', ?, ?)",
        (user_id, session_id, ai_response_text, datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")),
    )
    conn.commit()
    return ai_response_text, cursor.lastrowid


@app.post("/chat/message")
def send_chat(
    request: ChatMessageRequest,
    user_id: str = Depends(get_authenticated_user_id),
) -> Dict[str, object]:
    with get_db_connection() as conn:
        current_usage = get_user_24h_usage(conn, user_id)
        if current_usage >= DAILY_CHAT_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"24-hour chat limit exceeded. Maximum {DAILY_CHAT_LIMIT} messages allowed.",
            )
        
        # Save user message to DB
        cursor = conn.execute(
            "INSERT INTO chat_messages (user_id, session_id, sender, message, timestamp) VALUES (?, ?, 'user', ?, ?)",
            (user_id, request.session_id, request.message, datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")),
        )
        user_message_id = cursor.lastrowid
        conn.commit()

        # Insert entry into chat_sessions if it does not exist
        exists = conn.execute("SELECT 1 FROM chat_sessions WHERE session_id = ?", (request.session_id,)).fetchone()
        if not exists:
            title = request.message.strip().replace("\n", " ")
            if len(title) > 30:
                title = title[:30] + "..."
            conn.execute(
                "INSERT OR IGNORE INTO chat_sessions (session_id, user_id, title) VALUES (?, ?, ?)",
                (request.session_id, user_id, title)
            )
            conn.commit()

        # Generate response using helper
        ai_response_text, assistant_message_id = generate_and_save_response(
            conn, user_id, request.session_id, user_message_id, request.message
        )

        usage = record_chat_usage(conn, user_id)
        log_user_activity(conn, user_id, "/chat/message", "chat_message_success")

    return {
        "status": "success",
        "detail": "Chat processed.",
        "message": ai_response_text,
        "user_message_id": user_message_id,
        "assistant_message_id": assistant_message_id,
        "usage": {"message_count": usage, "daily_limit": DAILY_CHAT_LIMIT, "remaining": max(0, DAILY_CHAT_LIMIT - usage)},
    }


@app.post("/chat/message/edit")
def edit_chat_message(
    request: EditChatMessageRequest,
    user_id: str = Depends(get_authenticated_user_id),
) -> Dict[str, object]:
    with get_db_connection() as conn:
        # Verify ownership of the message
        row = conn.execute("SELECT session_id, user_id, sender FROM chat_messages WHERE id = ?", (request.message_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
        if row["user_id"] != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized to edit this message")
        if row["sender"] != "user":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only user messages can be edited")
        
        session_id = row["session_id"]
        
        # Delete all messages in the session after this message (id > message_id)
        conn.execute("DELETE FROM chat_messages WHERE session_id = ? AND id > ?", (session_id, request.message_id))
        
        # Update the message text for message_id
        conn.execute("UPDATE chat_messages SET message = ? WHERE id = ?", (request.message, request.message_id))
        conn.commit()
        
        # Check usage limits before regenerating
        current_usage = get_user_24h_usage(conn, user_id)
        if current_usage >= DAILY_CHAT_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"24-hour chat limit exceeded. Maximum {DAILY_CHAT_LIMIT} messages allowed.",
            )
        
        # Regenerate response using helper
        ai_response_text, assistant_message_id = generate_and_save_response(
            conn, user_id, session_id, request.message_id, request.message
        )
        
        # If this was the first message in the session, update the session title if it hasn't been custom-named
        first_msg_row = conn.execute(
            "SELECT id FROM chat_messages WHERE user_id = ? AND session_id = ? AND sender = 'user' ORDER BY id ASC LIMIT 1",
            (user_id, session_id)
        ).fetchone()
        if first_msg_row and first_msg_row["id"] == request.message_id:
            # It's the first message!
            new_title = request.message.strip().replace("\n", " ")
            if len(new_title) > 30:
                new_title = new_title[:30] + "..."
            conn.execute(
                "INSERT OR REPLACE INTO chat_sessions (session_id, user_id, title) VALUES (?, ?, ?)",
                (session_id, user_id, new_title)
            )
            conn.commit()
        
        usage = record_chat_usage(conn, user_id)
        log_user_activity(conn, user_id, "/chat/message/edit", "chat_message_edit_success")
        
    return {
        "status": "success",
        "detail": "Message edited and regenerated.",
        "message": ai_response_text,
        "user_message_id": request.message_id,
        "assistant_message_id": assistant_message_id,
        "usage": {"message_count": usage, "daily_limit": DAILY_CHAT_LIMIT, "remaining": max(0, DAILY_CHAT_LIMIT - usage)},
    }


@app.post("/chat/session/rename")
def rename_chat_session(
    request: RenameSessionRequest,
    user_id: str = Depends(get_authenticated_user_id),
) -> Dict[str, str]:
    with get_db_connection() as conn:
        # Verify ownership
        row = conn.execute("SELECT user_id FROM chat_sessions WHERE session_id = ?", (request.session_id,)).fetchone()
        if not row:
            row = conn.execute("SELECT user_id FROM chat_messages WHERE session_id = ?", (request.session_id,)).fetchone()
            
        if row and row["user_id"] != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized")
            
        # Update or Insert
        conn.execute(
            "INSERT OR REPLACE INTO chat_sessions (session_id, user_id, title) VALUES (?, ?, ?)",
            (request.session_id, user_id, request.title)
        )
        conn.commit()
        log_user_activity(conn, user_id, "/chat/session/rename", f"rename_session:{request.session_id}")
    return {"status": "success", "message": "Session renamed successfully"}


@app.delete("/chat/session/{session_id}")
def delete_chat_session(
    session_id: str,
    user_id: str = Depends(get_authenticated_user_id),
) -> Dict[str, str]:
    with get_db_connection() as conn:
        # Verify ownership
        row = conn.execute("SELECT user_id FROM chat_sessions WHERE session_id = ?", (session_id,)).fetchone()
        if not row:
            row = conn.execute("SELECT user_id FROM chat_messages WHERE session_id = ?", (session_id,)).fetchone()
            
        if row and row["user_id"] != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized")
            
        conn.execute("DELETE FROM chat_sessions WHERE session_id = ? AND user_id = ?", (session_id, user_id))
        conn.execute("DELETE FROM chat_messages WHERE session_id = ? AND user_id = ?", (session_id, user_id))
        conn.commit()
        workflow.clear_workflow_state(session_id)
        log_user_activity(conn, user_id, f"/chat/session/{session_id}", f"delete_session:{session_id}")
    return {"status": "success", "message": "Session deleted successfully"}


@app.get("/chat/history")
def get_chat_history(
    session_id: Optional[str] = "default",
    user_id: str = Depends(get_authenticated_user_id)
) -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        wf = workflow.get_workflow_state(session_id)
        if wf and wf.get("state") in {"AWAITING_DETAILS", "AWAITING_CUSTOM_REVISION"}:
            data = wf.get("data", {})
            has_collected_data = any(v for v in data.values() if v)
            
            is_recent = False
            updated_at_str = wf.get("updated_at")
            if updated_at_str:
                try:
                    updated_at = datetime.fromisoformat(updated_at_str)
                    if (datetime.utcnow() - updated_at).total_seconds() < 15:
                        is_recent = True
                except Exception:
                    pass
            
            if has_collected_data and not is_recent:
                last_msg = conn.execute(
                    "SELECT message, timestamp FROM chat_messages WHERE user_id = ? AND session_id = ? ORDER BY id DESC LIMIT 1",
                    (user_id, session_id)
                ).fetchone()
                
                recovery_prompt = "You were creating an item previously. Would you like to continue?"
                
                is_last_msg_recent = False
                if last_msg:
                    msg_time_str = last_msg["timestamp"]
                    try:
                        msg_time = datetime.strptime(msg_time_str, "%Y-%m-%d %H:%M:%S")
                        if (datetime.utcnow() - msg_time).total_seconds() < 15:
                            is_last_msg_recent = True
                    except Exception:
                        pass
                
                if not is_last_msg_recent and (not last_msg or last_msg["message"] != recovery_prompt):
                    prev_state = wf["state"]
                    workflow.save_workflow_state(session_id, "AWAITING_RECOVERY", data, previous_state=prev_state)
                    conn.execute(
                        "INSERT INTO chat_messages (user_id, session_id, sender, message, timestamp) VALUES (?, ?, 'assistant', ?, ?)",
                        (user_id, session_id, recovery_prompt, datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")),
                    )
                    conn.commit()

        rows = conn.execute(
            "SELECT id, sender, message, timestamp FROM chat_messages WHERE user_id = ? AND session_id = ? ORDER BY id ASC",
            (user_id, session_id)
        ).fetchall()
    return [dict(row) for row in rows]


@app.get("/chat/sessions")
def get_chat_sessions(user_id: str = Depends(get_authenticated_user_id)) -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        # Ensure all unique sessions in chat_messages have a record in chat_sessions
        db_sessions = conn.execute(
            "SELECT DISTINCT session_id FROM chat_messages WHERE user_id = ?",
            (user_id,)
        ).fetchall()
        
        for row in db_sessions:
            sid = row["session_id"]
            exists = conn.execute("SELECT 1 FROM chat_sessions WHERE session_id = ?", (sid,)).fetchone()
            if not exists:
                first_msg_row = conn.execute(
                    "SELECT message FROM chat_messages WHERE user_id = ? AND session_id = ? AND sender = 'user' ORDER BY id ASC LIMIT 1",
                    (user_id, sid)
                ).fetchone()
                title = "New Chat"
                if first_msg_row and first_msg_row["message"]:
                    title = first_msg_row["message"].strip().replace("\n", " ")
                    if len(title) > 30:
                        title = title[:30] + "..."
                conn.execute(
                    "INSERT OR IGNORE INTO chat_sessions (session_id, user_id, title) VALUES (?, ?, ?)",
                    (sid, user_id, title)
                )
        conn.commit()
        
        rows = conn.execute(
            """
            SELECT s.session_id, s.title, 
                   COALESCE(MAX(m.timestamp), s.created_at) AS last_active
            FROM chat_sessions s
            LEFT JOIN chat_messages m ON s.session_id = m.session_id AND s.user_id = m.user_id
            WHERE s.user_id = ?
            GROUP BY s.session_id
            ORDER BY last_active DESC
            """,
            (user_id,)
        ).fetchall()
    
    sessions = []
    for r in rows:
        sessions.append({
            "session_id": r["session_id"],
            "title": r["title"],
            "last_active": r["last_active"]
        })
    return sessions


@app.get("/user/profile")
def get_user_profile(user_id: str = Depends(get_authenticated_user_id)) -> Dict[str, Any]:
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT username, api_key, created_at FROM users WHERE username = ?",
            (user_id,)
        ).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return {
        "username": row["username"],
        "api_key": row["api_key"],
        "created_at": row["created_at"],
        "role": "Standard User"
    }


@app.get("/user/activity-logs")
def get_user_activity_logs(user_id: str = Depends(get_authenticated_user_id)) -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT action, timestamp FROM activity_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT 20",
            (user_id,)
        ).fetchall()
    return [dict(row) for row in rows]




@app.get("/chat/usage")
def chat_usage(user_id: str = Depends(get_authenticated_user_id)) -> Dict[str, object]:
    with get_db_connection() as conn:
        usage = get_user_24h_usage(conn, user_id)
    return {
        "user_id": user_id,
        "message_count": usage,
        "daily_limit": DAILY_CHAT_LIMIT,
        "remaining": max(0, DAILY_CHAT_LIMIT - usage),
    }


@app.post("/admin/chat/reset/{user_id}")
def admin_reset_chat_count(user_id: str, _: str = Depends(get_admin_token)) -> Dict[str, object]:
    with get_db_connection() as conn:
        clear_user_recent_chat_usage(conn, user_id)
        usage = get_user_24h_usage(conn, user_id)
    return {"status": "success", "message": "User chat history for the last 24 hours has been reset.", "usage": {"message_count": usage, "daily_limit": DAILY_CHAT_LIMIT, "remaining": max(0, DAILY_CHAT_LIMIT - usage)}}


@app.get("/admin/activity-logs")
def get_activity_logs(user_id: Optional[str] = None, _: str = Depends(get_admin_token)) -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        if user_id:
            rows = conn.execute(
                "SELECT id, user_id, endpoint, action, timestamp FROM activity_logs WHERE user_id = ? ORDER BY timestamp DESC",
                (user_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, user_id, endpoint, action, timestamp FROM activity_logs ORDER BY timestamp DESC"
            ).fetchall()
    return [dict(row) for row in rows]


@app.get("/dev/admin-token")
def get_dev_admin_token(request: Request) -> Dict[str, str]:
    client_host = request.client.host if request.client else ""
    if client_host not in {"127.0.0.1", "localhost", "::1"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin token can only be shown on localhost")
    if not SHOW_ADMIN_TOKEN_ON_SITE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Set SHOW_ADMIN_TOKEN_ON_SITE=true in .env to show the admin token on the site",
        )
    return {"admin_token": ADMIN_TOKEN}


@app.get("/health")
def health_check() -> Dict[str, str]:
    return {"status": "healthy"}


@app.get("/health/ai")
def health_check_ai() -> Dict[str, str]:
    client = get_gemini_client()
    if not client:
        return {"status": "offline", "details": "Gemini API key is not configured"}
    try:
        client.models.list_models()
        return {"status": "online", "details": "Gemini API is healthy"}
    except Exception as e:
        return {"status": "offline", "details": f"Connection check failed: {str(e)}"}


@app.post("/item/search")
def search_item(request: ItemRequest, _: str = Depends(get_authenticated_user_id)) -> Dict[str, object]:
    item_id = normalize_item_id(request.item_id)
    with get_db_connection() as conn:
        cursor = conn.execute(
            """
            SELECT i.item_id, i.item_name, i.item_description, 
                   i.createdAt, i.updatedAt, i.createdBy,
                   COALESCE(r.revision_id, 'A') as revision_id
            FROM items i
            LEFT JOIN (
                SELECT item_id, revision_id 
                FROM revisions 
                WHERE id IN (SELECT MAX(id) FROM revisions GROUP BY item_id)
            ) r ON i.item_id = r.item_id
            WHERE i.item_id = ?
            """,
            (item_id,)
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
        result = dict(row)
        for key, val in result.items():
            result[key] = "" if val is None else str(val).strip()
        log_user_activity(conn, _, "/item/search", "item_search")
    return result


@app.post("/item/add")
def add_item(request: ItemRequest, _: str = Depends(get_authenticated_user_id)) -> Dict[str, str]:
    item_id = normalize_item_id(request.item_id)
    if not item_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item ID is required")
    with get_db_connection() as conn:
        row = conn.execute("SELECT 1 FROM items WHERE item_id = ?", (item_id,)).fetchone()
        if row:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item already exists")
    
    revision_id = request.revision_id
    workflow.save_item_to_csv(
        item_id=item_id,
        item_name=request.item_name or "",
        item_description=request.item_description or "",
        revision_id=revision_id,
        created_by=_
    )
    with get_db_connection() as conn:
        log_user_activity(conn, _, "/item/add", "item_add")
    return {"message": "Item added successfully"}


@app.post("/item/list")
def list_items(_: str = Depends(get_authenticated_user_id)) -> object:
    with get_db_connection() as conn:
        cursor = conn.execute(
            """
            SELECT i.item_id, i.item_name, i.item_description, 
                   i.createdAt, i.updatedAt, i.createdBy,
                   COALESCE(r.revision_id, 'A') as revision_id
            FROM items i
            LEFT JOIN (
                SELECT item_id, revision_id 
                FROM revisions 
                WHERE id IN (SELECT MAX(id) FROM revisions GROUP BY item_id)
            ) r ON i.item_id = r.item_id
            """
        )
        rows = cursor.fetchall()
    result_list = []
    for r in rows:
        item_dict = dict(r)
        for key, val in item_dict.items():
            item_dict[key] = "" if val is None else str(val).strip()
        result_list.append(item_dict)
    return result_list


@app.post("/item/update")
def update_item_endpoint(request: ItemUpdateRequest, user_id: str = Depends(get_authenticated_user_id)) -> Dict[str, str]:
    item_id = normalize_item_id(request.item_id)
    if not item_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item ID is required")
    now = datetime.utcnow().isoformat()
    with get_db_connection() as conn:
        row = conn.execute("SELECT 1 FROM items WHERE item_id = ?", (item_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
        
        updates = []
        params = []
        if request.item_name is not None:
            updates.append("item_name = ?")
            params.append(request.item_name)
        if request.item_description is not None:
            updates.append("item_description = ?")
            params.append(request.item_description)
            
        if updates:
            updates.append("updatedAt = ?")
            params.append(now)
            params.append(item_id)
            query = f"UPDATE items SET {', '.join(updates)} WHERE item_id = ?"
            conn.execute(query, tuple(params))
            conn.commit()
            log_user_activity(conn, user_id, "/item/update", f"item_update:{item_id}")
    return {"message": "Item updated successfully"}


@app.post("/item/delete")
def delete_item_endpoint(request: ItemDeleteRequest, user_id: str = Depends(get_authenticated_user_id)) -> Dict[str, str]:
    item_id = normalize_item_id(request.item_id)
    if not item_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item ID is required")
    with get_db_connection() as conn:
        row = conn.execute("SELECT 1 FROM items WHERE item_id = ?", (item_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
        conn.execute("DELETE FROM items WHERE item_id = ?", (item_id,))
        conn.commit()
        log_user_activity(conn, user_id, "/item/delete", f"item_delete:{item_id}")
    return {"message": "Item deleted successfully"}


# --- Datasets Endpoints ---
@app.post("/dataset/add")
def add_dataset(request: DatasetAddRequest, user_id: str = Depends(get_authenticated_user_id)) -> Dict[str, str]:
    ds_id = request.dataset_id.strip()
    ds_name = request.dataset_name.strip()
    item_id = normalize_item_id(request.item_id)
    if not ds_id or not ds_name or not item_id:
        raise HTTPException(status_code=400, detail="dataset_id, dataset_name, and item_id are required")
    now = datetime.utcnow().isoformat()
    with get_db_connection() as conn:
        item = conn.execute("SELECT 1 FROM items WHERE item_id = ?", (item_id,)).fetchone()
        if not item:
            raise HTTPException(status_code=404, detail=f"Item '{item_id}' not found")
        existing = conn.execute("SELECT 1 FROM datasets WHERE dataset_id = ?", (ds_id,)).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="Dataset already exists")
        conn.execute(
            "INSERT INTO datasets (dataset_id, dataset_name, item_id, createdAt, updatedAt, createdBy) VALUES (?, ?, ?, ?, ?, ?)",
            (ds_id, ds_name, item_id, now, now, user_id)
        )
        conn.commit()
        log_user_activity(conn, user_id, "/dataset/add", f"dataset_add:{ds_id}")
    return {"message": "Dataset added successfully"}


@app.post("/dataset/update")
def update_dataset(request: DatasetUpdateRequest, user_id: str = Depends(get_authenticated_user_id)) -> Dict[str, str]:
    ds_id = request.dataset_id.strip()
    ds_name = request.dataset_name.strip()
    if not ds_id or not ds_name:
        raise HTTPException(status_code=400, detail="dataset_id and dataset_name are required")
    now = datetime.utcnow().isoformat()
    with get_db_connection() as conn:
        existing = conn.execute("SELECT 1 FROM datasets WHERE dataset_id = ?", (ds_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Dataset not found")
        conn.execute(
            "UPDATE datasets SET dataset_name = ?, updatedAt = ? WHERE dataset_id = ?",
            (ds_name, now, ds_id)
        )
        conn.commit()
        log_user_activity(conn, user_id, "/dataset/update", f"dataset_update:{ds_id}")
    return {"message": "Dataset updated successfully"}


@app.post("/dataset/delete")
def delete_dataset(request: DatasetDeleteRequest, user_id: str = Depends(get_authenticated_user_id)) -> Dict[str, str]:
    ds_id = request.dataset_id.strip()
    if not ds_id:
        raise HTTPException(status_code=400, detail="dataset_id is required")
    with get_db_connection() as conn:
        existing = conn.execute("SELECT 1 FROM datasets WHERE dataset_id = ?", (ds_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Dataset not found")
        conn.execute("DELETE FROM datasets WHERE dataset_id = ?", (ds_id,))
        conn.commit()
        log_user_activity(conn, user_id, "/dataset/delete", f"dataset_delete:{ds_id}")
    return {"message": "Dataset deleted successfully"}


@app.post("/dataset/list")
def list_datasets(request: ListFilterRequest, user_id: str = Depends(get_authenticated_user_id)) -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        if request.item_id:
            rows = conn.execute("SELECT * FROM datasets WHERE item_id = ?", (normalize_item_id(request.item_id),)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM datasets").fetchall()
    return [dict(r) for r in rows]


# --- Revisions Endpoints ---
@app.post("/revision/add")
def add_revision(request: RevisionAddRequest, user_id: str = Depends(get_authenticated_user_id)) -> Dict[str, str]:
    item_id = normalize_item_id(request.item_id)
    if not item_id:
        raise HTTPException(status_code=400, detail="item_id is required")
    now = datetime.utcnow().isoformat()
    with get_db_connection() as conn:
        item = conn.execute("SELECT 1 FROM items WHERE item_id = ?", (item_id,)).fetchone()
        if not item:
            raise HTTPException(status_code=404, detail=f"Item '{item_id}' not found")
            
        rev_id = request.revision_id.strip() if request.revision_id else workflow.get_next_revision_id(conn, item_id)
        
        existing = conn.execute("SELECT 1 FROM revisions WHERE item_id = ? AND revision_id = ?", (item_id, rev_id)).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail=f"Revision '{rev_id}' already exists for item '{item_id}'")
            
        conn.execute(
            "INSERT INTO revisions (revision_id, item_id, createdAt, updatedAt, createdBy) VALUES (?, ?, ?, ?, ?)",
            (rev_id, item_id, now, now, user_id)
        )
        conn.commit()
        log_user_activity(conn, user_id, "/revision/add", f"revision_add:{item_id}:{rev_id}")
    return {"message": "Revision added successfully", "revision_id": rev_id}


@app.post("/revision/delete")
def delete_revision(request: RevisionDeleteRequest, user_id: str = Depends(get_authenticated_user_id)) -> Dict[str, str]:
    item_id = normalize_item_id(request.item_id)
    rev_id = request.revision_id.strip()
    if not item_id or not rev_id:
        raise HTTPException(status_code=400, detail="item_id and revision_id are required")
    with get_db_connection() as conn:
        existing = conn.execute("SELECT 1 FROM revisions WHERE item_id = ? AND revision_id = ?", (item_id, rev_id)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail=f"Revision '{rev_id}' for item '{item_id}' not found")
        conn.execute("DELETE FROM revisions WHERE item_id = ? AND revision_id = ?", (item_id, rev_id))
        conn.commit()
        log_user_activity(conn, user_id, "/revision/delete", f"revision_delete:{item_id}:{rev_id}")
    return {"message": "Revision deleted successfully"}


@app.post("/revision/list")
def list_revisions(request: ListFilterRequest, user_id: str = Depends(get_authenticated_user_id)) -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        if request.item_id:
            rows = conn.execute("SELECT * FROM revisions WHERE item_id = ?", (normalize_item_id(request.item_id),)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM revisions").fetchall()
    return [dict(r) for r in rows]


# --- Workflows Endpoints ---
@app.post("/workflow/add")
def add_workflow(request: WorkflowAddRequest, user_id: str = Depends(get_authenticated_user_id)) -> Dict[str, str]:
    wf_id = request.workflow_id.strip()
    wf_name = request.workflow_name.strip()
    item_id = normalize_item_id(request.item_id)
    rev_id = request.revision_id.strip()
    status_str = request.workflow_status.strip() if request.workflow_status else "Draft"
    
    if not wf_id or not wf_name or not item_id or not rev_id:
        raise HTTPException(status_code=400, detail="workflow_id, workflow_name, item_id, and revision_id are required")
        
    now = datetime.utcnow().isoformat()
    with get_db_connection() as conn:
        rev_row = conn.execute("SELECT id FROM revisions WHERE item_id = ? AND revision_id = ?", (item_id, rev_id)).fetchone()
        if not rev_row:
            raise HTTPException(status_code=404, detail=f"Revision '{rev_id}' for item '{item_id}' not found")
        
        existing = conn.execute("SELECT 1 FROM workflows WHERE workflow_id = ?", (wf_id,)).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="Workflow already exists")
            
        conn.execute(
            "INSERT INTO workflows (workflow_id, workflow_name, workflow_status, revision_row_id, createdAt, updatedAt, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (wf_id, wf_name, status_str, rev_row["id"], now, now, user_id)
        )
        conn.commit()
        log_user_activity(conn, user_id, "/workflow/add", f"workflow_add:{wf_id}")
    return {"message": "Workflow added successfully"}


@app.post("/workflow/update")
def update_workflow(request: WorkflowUpdateRequest, user_id: str = Depends(get_authenticated_user_id)) -> Dict[str, str]:
    wf_id = request.workflow_id.strip()
    if not wf_id:
        raise HTTPException(status_code=400, detail="workflow_id is required")
        
    now = datetime.utcnow().isoformat()
    with get_db_connection() as conn:
        existing = conn.execute("SELECT 1 FROM workflows WHERE workflow_id = ?", (wf_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Workflow not found")
            
        updates = []
        params = []
        if request.workflow_name is not None:
            updates.append("workflow_name = ?")
            params.append(request.workflow_name.strip())
        if request.workflow_status is not None:
            updates.append("workflow_status = ?")
            params.append(request.workflow_status.strip())
            
        if updates:
            updates.append("updatedAt = ?")
            params.append(now)
            params.append(wf_id)
            query = f"UPDATE workflows SET {', '.join(updates)} WHERE workflow_id = ?"
            conn.execute(query, tuple(params))
            conn.commit()
            log_user_activity(conn, user_id, "/workflow/update", f"workflow_update:{wf_id}")
    return {"message": "Workflow updated successfully"}


@app.post("/workflow/delete")
def delete_workflow(request: WorkflowDeleteRequest, user_id: str = Depends(get_authenticated_user_id)) -> Dict[str, str]:
    wf_id = request.workflow_id.strip()
    if not wf_id:
        raise HTTPException(status_code=400, detail="workflow_id is required")
    with get_db_connection() as conn:
        existing = conn.execute("SELECT 1 FROM workflows WHERE workflow_id = ?", (wf_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Workflow not found")
        conn.execute("DELETE FROM workflows WHERE workflow_id = ?", (wf_id,))
        conn.commit()
        log_user_activity(conn, user_id, "/workflow/delete", f"workflow_delete:{wf_id}")
    return {"message": "Workflow deleted successfully"}


@app.post("/workflow/list")
def list_workflows(request: ListFilterRequest, user_id: str = Depends(get_authenticated_user_id)) -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        if request.item_id:
            rows = conn.execute(
                """
                SELECT w.*, r.revision_id, r.item_id 
                FROM workflows w
                JOIN revisions r ON w.revision_row_id = r.id
                WHERE r.item_id = ?
                """,
                (normalize_item_id(request.item_id),)
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT w.*, r.revision_id, r.item_id 
                FROM workflows w
                JOIN revisions r ON w.revision_row_id = r.id
                """
            ).fetchall()
    return [dict(r) for r in rows]


# --- Users Endpoints ---
@app.post("/user/delete")
def delete_user_endpoint(request: UserDeleteRequest, user_id: str = Depends(get_authenticated_user_id)) -> Dict[str, str]:
    username = request.username.strip().lower()
    if not username:
        raise HTTPException(status_code=400, detail="username is required")
    with get_db_connection() as conn:
        row = conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        conn.execute("DELETE FROM users WHERE username = ?", (username,))
        conn.commit()
        log_user_activity(conn, user_id, "/user/delete", f"user_delete:{username}")
    return {"message": "User deleted successfully"}


@app.get("/user/search/{username}")
def search_user_endpoint(username: str, user_id: str = Depends(get_authenticated_user_id)) -> Dict[str, Any]:
    target = username.strip().lower()
    with get_db_connection() as conn:
        row = conn.execute("SELECT username, createdAt, updatedAt, createdBy, api_key FROM users WHERE username = ?", (target,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        log_user_activity(conn, user_id, f"/user/search/{username}", "user_search")
    return dict(row)


@app.get("/users")
def list_users_endpoint(user_id: str = Depends(get_authenticated_user_id)) -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        rows = conn.execute("SELECT username, createdAt, updatedAt, createdBy FROM users").fetchall()
    return [dict(r) for r in rows]


# --- Interactive PLM AI Engine Endpoints ---

@app.post("/api/chat", response_model=ApiChatResponse)
def api_chat(
    request: ApiChatRequest,
    user_id: str = Depends(get_authenticated_user_id)
) -> ApiChatResponse:
    with get_db_connection() as conn:
        current_usage = get_user_24h_usage(conn, user_id)
        if current_usage >= DAILY_CHAT_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"24-hour chat limit exceeded. Maximum {DAILY_CHAT_LIMIT} messages allowed.",
            )
        
        # Save user message
        cursor = conn.execute(
            "INSERT INTO chat_messages (user_id, session_id, sender, message, timestamp) VALUES (?, ?, 'user', ?, ?)",
            (user_id, request.sessionId, request.message, datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")),
        )
        user_message_id = cursor.lastrowid
        conn.commit()

        # Insert entry into chat_sessions if it does not exist
        exists = conn.execute("SELECT 1 FROM chat_sessions WHERE session_id = ?", (request.sessionId,)).fetchone()
        if not exists:
            title = request.message.strip().replace("\n", " ")
            if len(title) > 30:
                title = title[:30] + "..."
            conn.execute(
                "INSERT OR IGNORE INTO chat_sessions (session_id, user_id, title) VALUES (?, ?, ?)",
                (request.sessionId, user_id, title)
            )
            conn.commit()

        executed_tools = []
        # Generate response using helper
        ai_response_text, assistant_message_id = generate_and_save_response(
            conn=conn,
            user_id=user_id,
            session_id=request.sessionId,
            user_message_id=user_message_id,
            message_text=request.message,
            model=request.model,
            environment=request.environment,
            executed_tools=executed_tools
        )

        usage = record_chat_usage(conn, user_id)
        log_user_activity(conn, user_id, "/api/chat", f"chat_api_call:{request.model}:{request.environment}")

    return ApiChatResponse(
        reply=ai_response_text,
        toolCalls=executed_tools,
        metadata={
            "sessionId": request.sessionId,
            "model": request.model,
            "environment": request.environment,
            "usage": {
                "message_count": usage,
                "daily_limit": DAILY_CHAT_LIMIT,
                "remaining": max(0, DAILY_CHAT_LIMIT - usage)
            }
        }
    )


@app.get("/health/backend")
def health_backend() -> Dict[str, str]:
    return {"status": "online"}


@app.get("/health/api")
def health_api() -> Dict[str, str]:
    client = get_gemini_client()
    if client:
        return {"status": "online"}
    return {"status": "offline"}


@app.get("/health/database")
def health_database() -> Dict[str, str]:
    try:
        with get_db_connection() as conn:
            conn.execute("SELECT 1").fetchone()
        return {"status": "online"}
    except Exception:
        return {"status": "offline"}


@app.get("/search/item-id")
def search_item_id(
    query: str,
    exact: bool = True,
    user_id: str = Depends(get_authenticated_user_id)
) -> List[Dict[str, Any]]:
    normalized = normalize_item_id(query)
    if not normalized:
        raise HTTPException(status_code=400, detail="Search query is required")
        
    with get_db_connection() as conn:
        log_user_activity(conn, user_id, "/search/item-id", f"search_id:{normalized}:{exact}")
        if exact:
            rows = conn.execute(
                "SELECT item_id, item_name, item_description, createdAt FROM items WHERE item_id = ?",
                (normalized,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT item_id, item_name, item_description, createdAt FROM items WHERE item_id LIKE ?",
                (f"%{normalized}%",)
            ).fetchall()
            
        result = []
        for r in rows:
            item = dict(r)
            item_id = item["item_id"]
            
            # Fetch Revisions
            revs = conn.execute("SELECT revision_id, createdAt FROM revisions WHERE item_id = ?", (item_id,)).fetchall()
            item["revisions"] = [dict(rev) for rev in revs]
            
            # Fetch Datasets
            dss = conn.execute("SELECT dataset_id, dataset_name, createdAt FROM datasets WHERE item_id = ?", (item_id,)).fetchall()
            item["datasets"] = [dict(ds) for ds in dss]
            
            # Fetch Workflows
            wfs = conn.execute(
                """
                SELECT w.workflow_id, w.workflow_name, w.workflow_status, w.createdAt 
                FROM workflows w
                JOIN revisions r ON w.revision_row_id = r.id
                WHERE r.item_id = ?
                """,
                (item_id,)
            ).fetchall()
            item["workflows"] = [dict(wf) for wf in wfs]
            
            result.append(item)
            
    return result


@app.get("/search/item-name")
def search_item_name(
    query: str,
    user_id: str = Depends(get_authenticated_user_id)
) -> List[Dict[str, Any]]:
    query_val = query.strip()
    if not query_val:
        raise HTTPException(status_code=400, detail="Search query is required")
        
    with get_db_connection() as conn:
        log_user_activity(conn, user_id, "/search/item-name", f"search_name:{query_val}")
        rows = conn.execute(
            "SELECT item_id, item_name, item_description, createdAt FROM items WHERE item_name LIKE ?",
            (f"%{query_val}%",)
        ).fetchall()
        
        result = []
        for r in rows:
            item = dict(r)
            item_id = item["item_id"]
            
            # Fetch Revisions
            revs = conn.execute("SELECT revision_id, createdAt FROM revisions WHERE item_id = ?", (item_id,)).fetchall()
            item["revisions"] = [dict(rev) for rev in revs]
            
            # Fetch Datasets
            dss = conn.execute("SELECT dataset_id, dataset_name, createdAt FROM datasets WHERE item_id = ?", (item_id,)).fetchall()
            item["datasets"] = [dict(ds) for ds in dss]
            
            # Fetch Workflows
            wfs = conn.execute(
                """
                SELECT w.workflow_id, w.workflow_name, w.workflow_status, w.createdAt 
                FROM workflows w
                JOIN revisions r ON w.revision_row_id = r.id
                WHERE r.item_id = ?
                """,
                (item_id,)
            ).fetchall()
            item["workflows"] = [dict(wf) for wf in wfs]
            
            result.append(item)
            
    return result


@app.get("/api/logs")
def get_audit_logs(
    page: int = 1,
    limit: int = 20,
    query: Optional[str] = None,
    type: str = "all",
    user_id: str = Depends(get_authenticated_user_id)
) -> Dict[str, Any]:
    offset = (page - 1) * limit
    
    where_clauses = ["user_id = ?"]
    params = [user_id]
    
    if query:
        where_clauses.append("(action LIKE ? OR endpoint LIKE ?)")
        params.extend([f"%{query}%", f"%{query}%"])
        
    if type != "all":
        if type == "error":
            where_clauses.append("action LIKE 'error%'")
        elif type == "tool":
            where_clauses.append("(action LIKE 'tool_call%' OR action LIKE 'chat_add_item%' OR action LIKE 'chat_update_item%' OR action LIKE 'chat_delete_item%')")
        elif type == "user":
            where_clauses.append("(action LIKE 'login%' OR action LIKE 'signup%' OR action LIKE 'logout%' OR action LIKE 'rename_session%' OR action LIKE 'delete_session%')")
        elif type == "security":
            where_clauses.append("(action LIKE 'credentials%' OR action LIKE 'api_key%')")
        elif type == "api":
            where_clauses.append("endpoint IN ('/chat/message', '/api/chat', '/chat/message/edit')")
            
    where_sql = " AND ".join(where_clauses)
    
    with get_db_connection() as conn:
        count_row = conn.execute(
            f"SELECT COUNT(*) as total FROM activity_logs WHERE {where_sql}",
            tuple(params)
        ).fetchone()
        total = count_row["total"]
        
        rows = conn.execute(
            f"SELECT action, endpoint, timestamp FROM activity_logs WHERE {where_sql} ORDER BY timestamp DESC LIMIT ? OFFSET ?",
            tuple(params + [limit, offset])
        ).fetchall()
        
    return {
        "logs": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit
    }


@app.get("/user/settings", response_model=UserSettingsResponse)
def get_user_settings(user_id: str = Depends(get_authenticated_user_id)) -> UserSettingsResponse:
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT openai_key, claude_key, gemini_key, tc_user, tc_pass, active_model, active_env FROM user_settings WHERE user_id = ?",
            (user_id,)
        ).fetchone()
        
    if not row:
        return UserSettingsResponse(
            openai_key="", claude_key="", gemini_key="",
            tc_user="tc_admin_prod", tc_pass="", active_model="gemini", active_env="dev"
        )
        
    def mask_key(k: Optional[str], prefix: str) -> str:
        if not k:
            return ""
        if len(k) <= 8:
            return "••••••••"
        return f"{prefix}••••••••"
        
    return UserSettingsResponse(
        openai_key=mask_key(row["openai_key"], "sk-proj-"),
        claude_key=mask_key(row["claude_key"], "ant-key-"),
        gemini_key=mask_key(row["gemini_key"], "gem-ai-"),
        tc_user=row["tc_user"] or "",
        tc_pass=mask_key(row["tc_pass"], "tc-"),
        active_model=row["active_model"] or "gemini",
        active_env=row["active_env"] or "dev"
    )


@app.post("/user/settings")
def update_user_settings(
    request: UserSettingsUpdateRequest,
    user_id: str = Depends(get_authenticated_user_id)
) -> Dict[str, str]:
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT openai_key, claude_key, gemini_key, tc_user, tc_pass FROM user_settings WHERE user_id = ?",
            (user_id,)
        ).fetchone()
        
        # Merge values. If value is masked (e.g. contains bullet characters), we preserve the existing DB value.
        def get_value(new_val: Optional[str], old_val: Optional[str]) -> Optional[str]:
            if new_val is None:
                return old_val
            if "••••" in new_val:
                return old_val
            return new_val
            
        openai_val = get_value(request.openai_key, row["openai_key"] if row else "")
        claude_val = get_value(request.claude_key, row["claude_key"] if row else "")
        gemini_val = get_value(request.gemini_key, row["gemini_key"] if row else "")
        tc_user_val = request.tc_user if request.tc_user is not None else (row["tc_user"] if row else "tc_admin_prod")
        tc_pass_val = get_value(request.tc_pass, row["tc_pass"] if row else "")
        model_val = request.active_model if request.active_model is not None else (row["active_model"] if row else "gemini")
        env_val = request.active_env if request.active_env is not None else (row["active_env"] if row else "dev")
        
        conn.execute(
            """
            INSERT OR REPLACE INTO user_settings 
            (user_id, openai_key, claude_key, gemini_key, tc_user, tc_pass, active_model, active_env)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, openai_val, claude_val, gemini_val, tc_user_val, tc_pass_val, model_val, env_val)
        )
        conn.commit()
        log_user_activity(conn, user_id, "/user/settings", "update_settings_success")
        
    return {"status": "success", "message": "Settings updated successfully"}


@app.post("/user/reset-password")
def reset_password(
    request: ResetPasswordRequest,
    user_id: str = Depends(get_authenticated_user_id)
) -> Dict[str, str]:
    if len(request.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters long")
        
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT password_hash, password_salt FROM users WHERE username = ?",
            (user_id,)
        ).fetchone()
        
        if not row or not verify_password(request.current_password, row["password_salt"], row["password_hash"]):
            raise HTTPException(status_code=400, detail="Incorrect current password")
            
        password_data = hash_password(request.new_password)
        conn.execute(
            "UPDATE users SET password_hash = ?, password_salt = ? WHERE username = ?",
            (password_data["hash"], password_data["salt"], user_id)
        )
        conn.commit()
        log_user_activity(conn, user_id, "/user/reset-password", "reset_password_success")
        
    return {"status": "success", "message": "Password updated successfully"}


@app.get("/{catchall:path}", response_class=FileResponse)
def read_index(catchall: str):
    index_file = FRONTEND_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return HTMLResponse("<h1>Teamcenter backend is running</h1><p>Frontend build index.html was not found.</p>", status_code=404)

