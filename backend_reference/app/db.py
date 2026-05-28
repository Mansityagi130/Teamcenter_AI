import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path("ai_chat.db")
SCHEMA_PATH = Path("schema/ai_chat.sql")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    if SCHEMA_PATH.exists():
        with connect() as conn:
            conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
            conn.commit()


@contextmanager
def session():
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
