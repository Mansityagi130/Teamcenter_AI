import os
import sqlite3
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from services.database import get_database_path
from .exceptions import (
    InvalidObjectTypeException,
    ObjectNotFoundException,
    PropertyNotFoundException,
)
from .service import TeamcenterPropertyService

router = APIRouter()
property_service = TeamcenterPropertyService()


def get_db_path() -> str:
    return str(get_database_path())


def verify_api_key(x_api_key: Optional[str] = Header(None, alias="X-API-Key")) -> str:
    """Verifies that the provided API key matches a valid user in the database."""
    if not x_api_key or not x_api_key.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-API-Key header",
        )
    api_key = x_api_key.strip()

    db_path = get_db_path()
    try:
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT username FROM users WHERE api_key = ?", (api_key,)
            ).fetchone()
            if not row:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid API key",
                )
            return row["username"]
    except sqlite3.Error as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database authentication error: {str(e)}",
        )


class BatchPropertiesRequest(BaseModel):
    object_type: str = Field(..., description="Type of the Teamcenter object (e.g. Item, Dataset)")
    object_id: str = Field(..., description="Unique identifier of the target object")
    properties: List[str] = Field(..., description="List of property names to retrieve")


@router.get("/api/properties/property")
def get_single_property(
    object_type: str = Query(..., description="Type of the Teamcenter object"),
    object_id: str = Query(..., description="Unique identifier of the target object"),
    property_name: str = Query(..., description="Name of the property to fetch"),
    username: str = Depends(verify_api_key),
):
    """Retrieves a single property value for a specified Teamcenter object."""
    try:
        val = property_service.get_property(object_type, object_id, property_name)
        return {"property_name": property_name, "value": val}
    except InvalidObjectTypeException as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except PropertyNotFoundException as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except ObjectNotFoundException as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/api/properties/batch")
def get_batch_properties(
    request: BatchPropertiesRequest,
    username: str = Depends(verify_api_key),
):
    """Retrieves a list of specified property values for a specified Teamcenter object."""
    try:
        return property_service.get_properties(
            request.object_type, request.object_id, request.properties
        )
    except InvalidObjectTypeException as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except PropertyNotFoundException as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except ObjectNotFoundException as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/api/properties/all")
def get_all_properties_endpoint(
    object_type: str = Query(..., description="Type of the Teamcenter object"),
    object_id: str = Query(..., description="Unique identifier of the target object"),
    username: str = Depends(verify_api_key),
):
    """Retrieves all property values for a specified Teamcenter object."""
    try:
        return property_service.get_all_properties(object_type, object_id)
    except InvalidObjectTypeException as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except ObjectNotFoundException as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
