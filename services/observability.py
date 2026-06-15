import os
import re
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from services.database import get_database_path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_FILE = get_database_path()
DATE_ONLY_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_FILE, detect_types=sqlite3.PARSE_DECLTYPES)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_observability_tables(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS request_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            method TEXT NOT NULL,
            path TEXT NOT NULL,
            status_code INTEGER NOT NULL,
            duration_ms REAL NOT NULL,
            error_message TEXT,
            service TEXT,
            tool_name TEXT,
            timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(username) ON DELETE SET NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_request_logs_timestamp ON request_logs(timestamp)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_request_logs_user ON request_logs(user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_request_logs_service ON request_logs(service)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_request_logs_tool ON request_logs(tool_name)")
    conn.commit()


def _normalize_date_input(value: Optional[str], end_of_day: bool = False) -> Optional[str]:
    if not value:
        return None
    value = value.strip()
    if DATE_ONLY_PATTERN.match(value):
        return f"{value} 23:59:59" if end_of_day else f"{value} 00:00:00"
    return value


def _build_filters(
    query: Optional[str] = None,
    status: Optional[str] = None,
    service: Optional[str] = None,
    tool: Optional[str] = None,
    user: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Tuple[str, List[Any]]:
    clauses: List[str] = []
    params: List[Any] = []

    if query:
        clauses.append("(path LIKE ? OR error_message LIKE ? OR tool_name LIKE ?)")
        pattern = f"%{query}%"
        params.extend([pattern, pattern, pattern])

    if status == "error":
        clauses.append("status_code >= 400")
    elif status == "success":
        clauses.append("status_code < 400")

    if service:
        clauses.append("service = ?")
        params.append(service)

    if tool:
        clauses.append("tool_name = ?")
        params.append(tool)

    if user:
        clauses.append("user_id = ?")
        params.append(user)

    if start_date:
        clauses.append("timestamp >= ?")
        params.append(_normalize_date_input(start_date, end_of_day=False))

    if end_date:
        clauses.append("timestamp <= ?")
        params.append(_normalize_date_input(end_date, end_of_day=True))

    where_clause = " AND ".join(clauses) if clauses else "1 = 1"
    return where_clause, params


def log_request(
    conn: sqlite3.Connection,
    user_id: Optional[str],
    method: str,
    path: str,
    status_code: int,
    duration_ms: float,
    error_message: Optional[str] = None,
    service: Optional[str] = None,
    tool_name: Optional[str] = None,
) -> None:
    conn.execute(
        "INSERT INTO request_logs (user_id, method, path, status_code, duration_ms, error_message, service, tool_name, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            user_id,
            method,
            path,
            status_code,
            duration_ms,
            error_message,
            service,
            tool_name,
            datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
        ),
    )
    conn.commit()


def query_error_logs(
    page: int = 1,
    limit: int = 20,
    query: Optional[str] = None,
    status: str = "all",
    service: Optional[str] = None,
    tool: Optional[str] = None,
    user: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Dict[str, Any]:
    offset = (page - 1) * limit
    where_clause, params = _build_filters(query, status, service, tool, user, start_date, end_date)

    with get_db_connection() as conn:
        count_row = conn.execute(
            f"SELECT COUNT(*) as total FROM request_logs WHERE {where_clause}",
            tuple(params),
        ).fetchone()

        rows = conn.execute(
            f"SELECT id, user_id, method, path, status_code, duration_ms, error_message, service, tool_name, timestamp "
            f"FROM request_logs WHERE {where_clause} ORDER BY timestamp DESC LIMIT ? OFFSET ?",
            tuple(params + [limit, offset]),
        ).fetchall()

    total = count_row["total"] if count_row else 0
    return {
        "logs": [dict(row) for row in rows],
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
    }


def get_log_metrics(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    service: Optional[str] = None,
    user: Optional[str] = None,
) -> Dict[str, Any]:
    where_clause, params = _build_filters(None, None, service, None, user, start_date, end_date)

    with get_db_connection() as conn:
        request_stats = conn.execute(
            f"SELECT COUNT(*) as total_requests, "
            f"SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_requests, "
            f"AVG(duration_ms) as average_latency_ms "
            f"FROM request_logs WHERE {where_clause}",
            tuple(params),
        ).fetchone()

        top_tools = conn.execute(
            "SELECT tool_name, COUNT(*) as usage_count, SUM(CASE WHEN status_code < 400 THEN 1 ELSE 0 END) as success_count, "
            "AVG(duration_ms) as avg_execution_time "
            "FROM mcp_tool_activity GROUP BY tool_name ORDER BY usage_count DESC LIMIT 5"
        ).fetchall()

        teamcenter_stats = conn.execute(
            f"SELECT COUNT(*) as total_requests, "
            f"SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_requests, "
            f"AVG(duration_ms) as average_latency_ms "
            f"FROM request_logs WHERE service = 'teamcenter' " + (f"AND {where_clause}" if where_clause != "1 = 1" else ""),
            tuple(params) if where_clause != "1 = 1" else (),
        ).fetchone()

        active_sessions = conn.execute("SELECT COUNT(*) as active_sessions FROM chat_sessions").fetchone()["active_sessions"]

    total_requests = request_stats["total_requests"] or 0
    error_requests = request_stats["error_requests"] or 0
    average_latency_ms = float(request_stats["average_latency_ms"] or 0.0)
    teamcenter_request_count = teamcenter_stats["total_requests"] or 0
    teamcenter_error_count = teamcenter_stats["error_requests"] or 0
    teamcenter_average_latency = float(teamcenter_stats["average_latency_ms"] or 0.0)

    return {
        "total_requests": total_requests,
        "error_requests": error_requests,
        "error_rate": round((error_requests / total_requests) * 100.0, 2) if total_requests else 0.0,
        "average_latency_ms": round(average_latency_ms, 2),
        "active_sessions": active_sessions,
        "top_mcp_tools": [
            {
                "tool_name": row["tool_name"],
                "usage_count": row["usage_count"],
                "success_rate": round((row["success_count"] or 0) / row["usage_count"] * 100.0, 2) if row["usage_count"] else 0.0,
                "avg_execution_time": round(float(row["avg_execution_time"] or 0.0), 2),
            }
            for row in top_tools
        ],
        "teamcenter_usage": {
            "request_count": teamcenter_request_count,
            "error_rate": round((teamcenter_error_count / teamcenter_request_count) * 100.0, 2) if teamcenter_request_count else 0.0,
            "average_latency_ms": round(teamcenter_average_latency, 2),
        },
    }


def get_log_trends(
    granularity: str = "hour",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    service: Optional[str] = None,
    user: Optional[str] = None,
) -> Dict[str, Any]:
    granularity = granularity if granularity in {"hour", "day"} else "hour"
    field = "%Y-%m-%dT%H:00:00" if granularity == "hour" else "%Y-%m-%d"
    filters: List[str] = []
    params: List[Any] = []

    if service:
        filters.append("service = ?")
        params.append(service)

    if user:
        filters.append("user_id = ?")
        params.append(user)

    if start_date:
        filters.append("timestamp >= ?")
        params.append(_normalize_date_input(start_date, end_of_day=False))

    if end_date:
        filters.append("timestamp <= ?")
        params.append(_normalize_date_input(end_date, end_of_day=True))

    where_clause = " AND ".join(filters) if filters else "1 = 1"

    with get_db_connection() as conn:
        rows = conn.execute(
            f"SELECT strftime('{field}', timestamp) as bucket, "
            f"COUNT(*) as request_count, "
            f"SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count, "
            f"AVG(duration_ms) as average_latency_ms "
            f"FROM request_logs "
            f"WHERE {where_clause} "
            f"GROUP BY bucket ORDER BY bucket ASC",
            tuple(params),
        ).fetchall()

    return {
        "granularity": granularity,
        "points": [
            {
                "bucket": row["bucket"],
                "request_count": row["request_count"],
                "error_count": row["error_count"],
                "average_latency_ms": round(float(row["average_latency_ms"] or 0.0), 2),
            }
            for row in rows
        ],
    }
