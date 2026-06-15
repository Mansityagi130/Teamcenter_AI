import os
import sqlite3
import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from services.database import get_database_path
from teamcenter.api_catalog.service import PREDEFINED_CATALOG
from teamcenter.dynamic_executor.service import TeamcenterDynamicExecutor

router = APIRouter(prefix="/api/explorer")
logger = logging.getLogger("services.api_catalog")


def get_db_path() -> str:
    return str(get_database_path())


def verify_api_key(x_api_key: Optional[str] = Header(None, alias="X-API-Key")) -> str:
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


class ApiSearchRequest(BaseModel):
    keyword: str = Field(..., min_length=1, description="Search keyword for service names, operations, or descriptions")


class ApiExecuteRequest(BaseModel):
    service_name: Optional[str] = Field(None, description="Service name in the Teamcenter API path")
    operation_name: Optional[str] = Field(None, description="Operation name in the Teamcenter API path")
    endpoint: Optional[str] = Field(None, description="Optional raw endpoint path or URL")
    method: str = Field("POST", description="HTTP method to execute")
    headers: Optional[Dict[str, str]] = Field(None, description="Optional HTTP headers")
    params: Optional[Dict[str, Any]] = Field(None, description="Optional query parameters")
    payload: Optional[Any] = Field(None, description="Optional request payload")
    timeout: int = Field(10, ge=1, description="Request timeout in seconds")
    max_retries: int = Field(3, ge=0, description="Maximum retry attempts")


class TeamcenterApiExplorerService:
    def __init__(self):
        self.catalog = PREDEFINED_CATALOG
        self.executor = TeamcenterDynamicExecutor()

    def _normalize_path(self, endpoint: str) -> str:
        endpoint = endpoint.strip()
        if endpoint.startswith("http://") or endpoint.startswith("https://"):
            return endpoint
        if not endpoint.startswith("/"):
            endpoint = f"/{endpoint}"
        return endpoint

    def _split_path(self, endpoint: str) -> (str, str):
        endpoint = self._normalize_path(endpoint)
        trimmed = endpoint.lstrip("/")
        segments = trimmed.split("/") if trimmed else []
        service = segments[0] if segments else ""
        operation = "/".join(segments[1:]) if len(segments) > 1 else ""
        return service, operation

    def _build_request_schema(self, parameters: Dict[str, Any]) -> Dict[str, Any]:
        schema: Dict[str, Any] = {"type": "object", "properties": {}, "required": []}
        for name, param in parameters.items():
            schema["properties"][name] = {
                "type": param.get("type", "string").lower(),
                "description": param.get("description", ""),
            }
            if param.get("required"):
                schema["required"].append(name)
        return schema

    def _build_response_schema(self, endpoint: str, method: str) -> Dict[str, Any]:
        if endpoint.startswith("/dataset/download"):
            return {"type": "string", "description": "Binary or text download payload."}
        if method.upper() == "GET":
            return {"type": "object", "description": "Teamcenter GET response payload."}
        return {"type": "object", "description": "Teamcenter response payload."}

    def _build_operation_metadata(self, entry: Dict[str, Any]) -> Dict[str, Any]:
        service, operation = self._split_path(entry["endpoint"])
        request_schema = self._build_request_schema(entry.get("parameters", {}))
        return {
            "service": service,
            "operation": operation,
            "method": entry["method"],
            "endpoint": entry["endpoint"],
            "category": entry.get("category", ""),
            "description": entry.get("description", ""),
            "parameters": entry.get("parameters", {}),
            "request_schema": request_schema,
            "response_schema": self._build_response_schema(entry["endpoint"], entry["method"]),
        }

    def list_services(self) -> List[Dict[str, Any]]:
        services: Dict[str, Dict[str, Any]] = {}
        for entry in self.catalog:
            service, _ = self._split_path(entry["endpoint"])
            if service not in services:
                services[service] = {
                    "service": service,
                    "category": entry.get("category", ""),
                    "description": f"Explore {service} operations.",
                    "operation_count": 0,
                }
            services[service]["operation_count"] += 1
        items = sorted(services.values(), key=lambda x: x["service"])
        logger.info(f"action=list_services status=success total_services={len(items)}")
        return items

    def get_service_details(self, service: str) -> Dict[str, Any]:
        normalized = service.strip().lower()
        operations: List[Dict[str, Any]] = []
        for entry in self.catalog:
            entry_service, operation = self._split_path(entry["endpoint"])
            if entry_service.lower() == normalized:
                metadata = self._build_operation_metadata(entry)
                operations.append(metadata)

        if not operations:
            raise ValueError(f"Service '{service}' not found.")

        operations = sorted(operations, key=lambda x: x["operation"])
        return {
            "service": service,
            "category": operations[0].get("category", ""),
            "description": f"Operations available for the {service} service.",
            "operations": operations,
        }

    def get_operation_details(self, service: str, operation: str) -> Dict[str, Any]:
        normalized_service = service.strip().lower()
        normalized_operation = operation.strip().lstrip("/")
        target_endpoint = f"/{normalized_service}/{normalized_operation}" if normalized_operation else f"/{normalized_service}"

        for entry in self.catalog:
            service_name, operation_name = self._split_path(entry["endpoint"])
            if service_name.lower() == normalized_service and operation_name == normalized_operation:
                return self._build_operation_metadata(entry)

        raise ValueError(f"Operation '{service}/{operation}' not found.")

    def search(self, keyword: str) -> List[Dict[str, Any]]:
        q = keyword.strip().lower()
        if not q:
            return []

        matches: List[Dict[str, Any]] = []
        for entry in self.catalog:
            service, operation = self._split_path(entry["endpoint"])
            searchable = " ".join([
                entry["endpoint"],
                entry.get("category", ""),
                entry.get("description", ""),
                service,
                operation,
            ]).lower()
            if q in searchable:
                metadata = self._build_operation_metadata(entry)
                matches.append(metadata)

        logger.info(f"action=search_api status=success keyword={keyword} results_count={len(matches)}")
        return matches

    def execute(self, request: ApiExecuteRequest) -> Dict[str, Any]:
        endpoint = request.endpoint
        if not endpoint:
            if request.service_name and request.operation_name:
                endpoint = f"/{request.service_name.strip()}/{request.operation_name.strip()}"
            else:
                raise ValueError("Either endpoint or both service_name and operation_name must be provided.")

        return self.executor.execute(
            endpoint=endpoint,
            method=request.method,
            headers=request.headers,
            payload=request.payload,
            params=request.params,
            timeout=request.timeout,
            max_retries=request.max_retries,
        )


explorer_service = TeamcenterApiExplorerService()


@router.get("/services", response_model=List[Dict[str, Any]])
def list_services(username: str = Depends(verify_api_key)):
    return explorer_service.list_services()


@router.get("/service/{service}", response_model=Dict[str, Any])
def get_service(service: str, username: str = Depends(verify_api_key)):
    try:
        return explorer_service.get_service_details(service)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/operation/{service}/{operation:path}", response_model=Dict[str, Any])
def get_operation(service: str, operation: str, username: str = Depends(verify_api_key)):
    try:
        return explorer_service.get_operation_details(service, operation)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/search", response_model=List[Dict[str, Any]])
def search_api(request: ApiSearchRequest, username: str = Depends(verify_api_key)):
    return explorer_service.search(request.keyword)


@router.post("/execute", response_model=Dict[str, Any])
def execute_api(request: ApiExecuteRequest, username: str = Depends(verify_api_key)):
    try:
        return explorer_service.execute(request)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
