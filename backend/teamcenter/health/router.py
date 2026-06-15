import os
import sqlite3
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, status
from services.database import get_database_path
from .service import TeamcenterHealthService

router = APIRouter(prefix="/teamcenter")
health_service = TeamcenterHealthService()


def get_db_path() -> str:
    return str(get_database_path())


def verify_api_key(x_api_key: Optional[str] = Header(None, alias="X-API-Key")) -> str:
    """Verifies that the provided API key matches a valid user in the database."""
    if not x_api_key or not x_api_key.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-API-Key header"
        )
    api_key = x_api_key.strip()

    db_path = get_db_path()
    try:
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT username FROM users WHERE api_key = ?",
                (api_key,)
            ).fetchone()
            if not row:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid API key"
                )
            return row["username"]
    except sqlite3.Error as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database authentication error: {str(e)}"
        )


@router.get("/ping", response_model=Dict[str, Any])
def tc_ping():
    """Low-overhead ping endpoint to check health monitor responsiveness."""
    from datetime import datetime, timezone
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    }


@router.get("/status", response_model=Dict[str, Any])
def tc_status():
    """Fetches general status check mapping for all critical Teamcenter subsystems."""
    return health_service.get_status()


@router.get("/health", response_model=Dict[str, Any])
def tc_health(username: str = Depends(verify_api_key)):
    """Retrieves deep diagnostics, response latency metrics, and troubleshooting checklists."""
    return health_service.get_detailed_health()
