import os
import json
import sqlite3
from pathlib import Path
from datetime import datetime
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

MEMORY_FILE = 'memory.json'
DB_FILE = Path('teamcenter.db')
SQL_FILE = Path('teamcenter.sql')


class RememberRequest(BaseModel):
    content: str


class TeamCenterRequest(BaseModel):
    item_id: str


def load_memory():
    if os.path.exists(MEMORY_FILE):
        with open(MEMORY_FILE, 'r') as f:
            return json.load(f)
    return []


def save_memory(memory):
    with open(MEMORY_FILE, 'w') as f:
        json.dump(memory, f)


def init_db():
    """Initialize the SQLite DB from SQL_FILE if it doesn't exist."""
    if DB_FILE.exists():
        return
    conn = sqlite3.connect(DB_FILE)
    try:
        if SQL_FILE.exists():
            with open(SQL_FILE, 'r', encoding='utf-8') as f:
                sql = f.read()
            conn.executescript(sql)
        else:
            # fallback: create minimal schema and seed data
            conn.executescript(
                """
                CREATE TABLE items (
                    item_id TEXT PRIMARY KEY,
                    name TEXT,
                    revision TEXT,
                    status TEXT,
                    owner TEXT
                );
                INSERT INTO items(item_id, name, revision, status, owner) VALUES
                    ('P-1001', 'Motor Assembly', 'A', 'Released', 'Amit'),
                    ('P-1002', 'Gear Housing', 'B', 'In Review', 'Riya');
                """
            )
        conn.commit()
    finally:
        conn.close()


def row_to_dict(cursor, row):
    if row is None:
        return None
    return {col[0]: row[idx] for idx, col in enumerate(cursor.description)}


@app.on_event("startup")
def on_startup():
    init_db()


@app.post("/tools/remember")
def remember(request: RememberRequest):
    memory = load_memory()
    memory.append({
        "content": request.content,
        "timestamp": datetime.now().isoformat()
    })
    save_memory(memory)
    return {"status": "success"}


@app.get("/tools/recall")
def recall():
    memory = load_memory()
    # return full memory list
    return {"content": memory}


@app.post("/tools/teamcenter/search")
def teamcenter_search(request: TeamCenterRequest):
    # ensure DB exists and is initialized
    init_db()
    conn = sqlite3.connect(DB_FILE)
    try:
        cur = conn.cursor()
        # normalize item id to uppercase for matching
        item_id = request.item_id.strip().upper()
        cur.execute("SELECT item_id, name, revision, status, owner FROM items WHERE UPPER(item_id)=?", (item_id,))
        row = cur.fetchone()
        item = row_to_dict(cur, row)
        if not item:
            return {"status": "error", "message": "Item not found"}
        return {"status": "success", "item": item}
    finally:
        conn.close()


@app.get("/health")
def health_check():
    return {"status": "healthy"}