import os
import sqlite3
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, Header, HTTPException, status
from services.database import get_database_path
from .exceptions import InvalidSearchFilterException, SearchExecutionException
from .service import TeamcenterSearchEngine

router = APIRouter()
search_engine = TeamcenterSearchEngine()


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


class SearchFilters(BaseModel):
    type: Optional[str] = Field(None, description="Filter by object type (e.g. Item, ItemRevision)")
    owner: Optional[str] = Field(None, description="Filter by owner (createdBy)")
    status: Optional[str] = Field(None, description="Filter by workflow release status")
    start_date: Optional[str] = Field(None, description="Creation start date ISO format")
    end_date: Optional[str] = Field(None, description="Creation end date ISO format")


class SearchRequest(BaseModel):
    query: Optional[str] = Field(None, description="Search keyword query string")
    filters: Optional[SearchFilters] = Field(None, description="Query filtering rules")
    sort_by: Optional[str] = Field("relevance", description="Sort parameter (relevance, createdAt, updatedAt, id, name)")
    sort_order: Optional[str] = Field("desc", description="Sort order (asc or desc)")
    limit: Optional[int] = Field(10, description="Pagination result limit")
    offset: Optional[int] = Field(0, description="Pagination offset index")


@router.post("/query", response_model=Dict[str, Any])
def query_search_engine(
    request: SearchRequest,
    username: str = Depends(verify_api_key)
):
    """Executes advanced metadata queries on Teamcenter database."""
    filters_dict = request.filters.model_dump(exclude_unset=True) if request.filters else {}
    try:
        return search_engine.search(
            query=request.query,
            filters=filters_dict,
            sort_by=request.sort_by,
            sort_order=request.sort_order,
            limit=request.limit,
            offset=request.offset
        )
    except InvalidSearchFilterException as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except SearchExecutionException as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
