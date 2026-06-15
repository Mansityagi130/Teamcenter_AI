import os
import sqlite3
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from services.database import get_database_path
from .exceptions import EndpointNotFoundException
from .service import TeamcenterApiCatalog

router = APIRouter(prefix="/api/catalog")
api_catalog = TeamcenterApiCatalog()


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


@router.get("", response_model=List[Dict[str, Any]])
def list_api_catalog(
    category: Optional[str] = Query(None, description="Filter catalog by category"),
    q: Optional[str] = Query(None, description="Search term matching endpoint name, category, or description"),
    username: str = Depends(verify_api_key)
):
    """Lists registered Teamcenter API endpoints with optional search and category filters."""
    return api_catalog.get_catalog(category=category, q=q)


@router.get("/metadata", response_model=Dict[str, Any])
def get_endpoint_metadata(
    method: str = Query(..., description="HTTP Method (GET, POST, etc.)"),
    endpoint: str = Query(..., description="API Path (e.g. /item/search)"),
    username: str = Depends(verify_api_key)
):
    """Retrieves full documentation and parameters metadata schema for a specific endpoint."""
    try:
        return api_catalog.get_api_metadata(method=method, endpoint=endpoint)
    except EndpointNotFoundException as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


@router.get("/statistics", response_model=Dict[str, Any])
def get_endpoint_statistics(
    method: str = Query(..., description="HTTP Method (GET, POST, etc.)"),
    endpoint: str = Query(..., description="API Path (e.g. /item/search)"),
    username: str = Depends(verify_api_key)
):
    """Retrieves real-time call counts, unique caller counts, and last invocation timestamp from logs."""
    try:
        return api_catalog.get_usage_statistics(method=method, endpoint=endpoint)
    except EndpointNotFoundException as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


@router.get("/statistics/all", response_model=Dict[str, Any])
def get_all_endpoints_statistics(username: str = Depends(verify_api_key)):
    """Compiles call counts summary stats for all catalog endpoints."""
    return api_catalog.get_all_usage_statistics()
