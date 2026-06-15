import os
import sqlite3
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, Header, HTTPException, status
from services.database import get_database_path
from .exceptions import ValidationException, ConnectionException, ExecutionTimeoutException
from .service import TeamcenterDynamicExecutor

router = APIRouter()
raw_router = APIRouter()
executor_service = TeamcenterDynamicExecutor()


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


class ExecuteRequest(BaseModel):
    endpoint: str = Field(..., description="Target Teamcenter endpoint URL (relative or absolute)")
    method: str = Field(..., description="HTTP verb: GET, POST, PUT, PATCH, DELETE")
    headers: Optional[Dict[str, str]] = Field(None, description="Optional request headers")
    payload: Optional[Any] = Field(None, description="Optional request body payload")
    params: Optional[Dict[str, Any]] = Field(None, description="Optional query parameters")
    timeout: Optional[int] = Field(10, description="Execution timeout limit in seconds")
    max_retries: Optional[int] = Field(3, description="Maximum exponential retries attempts")


class TeamcenterRawRequest(BaseModel):
    service_name: Optional[str] = Field(None, description="Convenience service name for the target Teamcenter path")
    operation_name: Optional[str] = Field(None, description="Convenience operation name for the target Teamcenter path")
    endpoint: Optional[str] = Field(None, description="Optional raw Teamcenter endpoint path or absolute URL")
    method: str = Field(..., description="HTTP verb: GET, POST, PUT, PATCH, DELETE")
    headers: Optional[Dict[str, str]] = Field(None, description="Optional request headers")
    payload: Optional[Any] = Field(None, description="Optional request body payload")
    params: Optional[Dict[str, Any]] = Field(None, description="Optional query parameters")
    timeout: Optional[int] = Field(10, description="Execution timeout limit in seconds")
    max_retries: Optional[int] = Field(3, description="Maximum exponential retries attempts")


def _resolve_raw_endpoint(request: TeamcenterRawRequest) -> str:
    if request.endpoint:
        endpoint = request.endpoint.strip()
        if not endpoint:
            raise ValidationException("Raw endpoint cannot be empty when provided.")
        if endpoint.startswith("http://") or endpoint.startswith("https://"):
            return endpoint
        return endpoint if endpoint.startswith("/") else f"/{endpoint}"

    if not request.service_name or not request.operation_name:
        raise ValidationException("Either endpoint or both service_name and operation_name must be provided.")

    service_name = request.service_name.strip().lstrip("/")
    operation_name = request.operation_name.strip().lstrip("/")

    if not service_name or not operation_name:
        raise ValidationException("Both service_name and operation_name must be non-empty strings.")

    return f"/{service_name}/{operation_name}"


@router.post("/execute", response_model=Dict[str, Any])
def execute_endpoint(
    request: ExecuteRequest,
    username: str = Depends(verify_api_key)
):
    """Executes arbitrary Teamcenter endpoints dynamically."""
    try:
        return executor_service.execute(
            endpoint=request.endpoint,
            method=request.method,
            headers=request.headers,
            payload=request.payload,
            params=request.params,
            timeout=request.timeout,
            max_retries=request.max_retries
        )
    except ValidationException as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except ExecutionTimeoutException as e:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=str(e)
        )
    except ConnectionException as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(e)
        )


@raw_router.post("/raw", response_model=Dict[str, Any])
def execute_raw_teamcenter(
    request: TeamcenterRawRequest,
    username: str = Depends(verify_api_key)
):
    """Executes any Teamcenter service and operation through a generic raw command."""
    try:
        endpoint = _resolve_raw_endpoint(request)
        return executor_service.execute(
            endpoint=endpoint,
            method=request.method,
            headers=request.headers,
            payload=request.payload,
            params=request.params,
            timeout=request.timeout,
            max_retries=request.max_retries,
        )
    except ValidationException as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except ExecutionTimeoutException as e:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=str(e)
        )
    except ConnectionException as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(e)
        )
