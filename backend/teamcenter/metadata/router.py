import os
import sqlite3
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from services.database import get_database_path
from .exceptions import ObjectTypeNotFoundException, SearchException
from .service import TeamcenterMetadataService

router = APIRouter()
metadata_service = TeamcenterMetadataService()


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


@router.get("/types", response_model=List[str])
def list_object_types(username: str = Depends(verify_api_key)):
    """Lists all supported object types in the metadata catalog."""
    return metadata_service.get_object_types()


@router.get("/types/{type_name}", response_model=Dict[str, Any])
def get_object_type_schema(type_name: str, username: str = Depends(verify_api_key)):
    """Retrieves schema properties and relationships for the specified object type."""
    try:
        return metadata_service.get_type_schema(type_name)
    except ObjectTypeNotFoundException as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


@router.get("/relationships", response_model=List[Dict[str, Any]])
def list_relationships(username: str = Depends(verify_api_key)):
    """Lists relationships configured between all object types."""
    return metadata_service.get_relationships()


@router.get("/datasets/types", response_model=List[str])
def list_dataset_types(username: str = Depends(verify_api_key)):
    """Lists supported dataset files types."""
    return metadata_service.get_dataset_types()


@router.get("/workflows/types", response_model=List[str])
def list_workflow_types(username: str = Depends(verify_api_key)):
    """Lists configured workflow templates/process types."""
    return metadata_service.get_workflow_types()


@router.get("/search", response_model=Dict[str, Any])
def search_metadata(
    q: str = Query(..., description="Query keyword to search for in schema"),
    username: str = Depends(verify_api_key)
):
    """Searches the metadata catalog by matching keywords on types, fields, and relationships."""
    try:
        return metadata_service.search_metadata(q)
    except SearchException as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
