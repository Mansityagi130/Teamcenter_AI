import os
import sys
import time
import sqlite3
import random
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from services.database import get_database_path

# Add root folder to sys.path to easily import mcp_server
base_dir = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)
if base_dir not in sys.path:
    sys.path.insert(0, base_dir)

from mcp_server import mcp

router = APIRouter()

# TOOL CATEGORIES MAPPING
TOOL_CATEGORIES = {
    # Metadata Discovery
    "get_object_types": "Metadata Discovery",
    "get_property_schema": "Metadata Discovery",
    "get_relationships": "Metadata Discovery",
    
    # Property Retrieval
    "get_property": "Property Retrieval",
    "get_properties": "Property Retrieval",
    "get_all_properties": "Property Retrieval",
    
    # Advanced Search
    "advanced_search": "Advanced Search",
    "search_workflows": "Advanced Search",
    
    # Health Monitoring
    "check_teamcenter_health": "Health Monitoring",
    "check_sessions": "Health Monitoring",
    "check_authentication": "Health Monitoring",
    
    # API Discovery
    "list_available_apis": "API Discovery",
    "search_api_catalog": "API Discovery",
    
    # Core Operations
    "search_items": "Item Management",
    "get_item": "Item Management",
    "create_item": "Item Management",
    "update_item": "Item Management",
    "delete_item": "Item Management",
    
    "get_bom": "Structure Management",
    "expand_bom": "Structure Management",
    
    "create_workflow": "Workflow Management",
    "approve_workflow": "Workflow Management",
    
    "search_datasets": "Dataset Management",
    "download_dataset": "Dataset Management",
    
    "get_user_details": "Utility",
    "show_system_capabilities": "Utility"
}


# Database Helpers
def get_db_path() -> str:
    return str(get_database_path())


def get_db_connection() -> sqlite3.Connection:
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initializes the mcp_tool_activity table."""
    try:
        with get_db_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS mcp_tool_activity (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tool_name TEXT NOT NULL,
                    duration_ms REAL NOT NULL,
                    status TEXT NOT NULL, -- 'success' or 'error'
                    error_message TEXT,
                    timestamp TEXT NOT NULL
                )
                """
            )
            conn.commit()
        seed_mcp_activity_if_empty()
    except sqlite3.Error as e:
        print(f"Error initializing mcp_tool_activity table: {e}")


def seed_mcp_activity_if_empty():
    """Seeds the activity history log database if it is empty."""
    try:
        with get_db_connection() as conn:
            count = conn.execute("SELECT COUNT(*) FROM mcp_tool_activity").fetchone()[0]
            if count == 0:
                tools = [
                    "search_items", "get_item", "create_item", "update_item", "get_bom",
                    "expand_bom", "create_workflow", "approve_workflow", "search_datasets",
                    "check_teamcenter_health", "check_sessions", "list_available_apis"
                ]
                now = datetime.now(timezone.utc).replace(tzinfo=None)
                for tool in tools:
                    # Seed between 10 and 30 runs per tool
                    num_runs = random.randint(10, 30)
                    for _ in range(num_runs):
                        duration = random.uniform(30.0, 320.0)
                        # ~92% success rate
                        status_val = "success" if random.random() < 0.92 else "error"
                        err_msg = "Object not found" if status_val == "error" else None
                        time_offset = random.randint(1, 120)  # last 5 days
                        timestamp = (now - timedelta(hours=time_offset)).isoformat()
                        conn.execute(
                            """
                            INSERT INTO mcp_tool_activity (tool_name, duration_ms, status, error_message, timestamp)
                            VALUES (?, ?, ?, ?, ?)
                            """,
                            (tool, duration, status_val, err_msg, timestamp)
                        )
                conn.commit()
    except sqlite3.Error as e:
        print(f"Error seeding mcp_tool_activity data: {e}")


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


def verify_admin_access(username: str = Depends(verify_api_key)) -> str:
    """Restricts routes to administrators."""
    username_lower = username.lower()
    if username_lower in {"mansi", "system", "smoketest", "tc_admin_prod"} or "admin" in username_lower:
        return username
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Admin privileges required to access this resource"
    )


# Log execution helper
def log_tool_execution(tool_name: str, duration_ms: float, status_val: str, error_message: Optional[str] = None):
    try:
        timestamp = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
        with get_db_connection() as conn:
            conn.execute(
                """
                INSERT INTO mcp_tool_activity (tool_name, duration_ms, status, error_message, timestamp)
                VALUES (?, ?, ?, ?, ?)
                """,
                (tool_name, duration_ms, status_val, error_message, timestamp)
            )
            conn.commit()
    except sqlite3.Error as e:
        print(f"Failed to log MCP tool execution activity: {e}")


# Pydantic schemas
class ExecutionRequest(BaseModel):
    tool_name: str
    arguments: Dict[str, Any] = {}


# --- Routes ---

@router.get("/tools")
async def get_mcp_tools(username: str = Depends(verify_admin_access)):
    """Fetch the list of all registered tools on the MCP server with categorization and schemas."""
    try:
        tools = await mcp.list_tools()
        formatted_tools = []
        for t in tools:
            name = t.name
            category = TOOL_CATEGORIES.get(name, "Utility")
            formatted_tools.append({
                "name": name,
                "description": t.description or "",
                "inputSchema": t.inputSchema or {},
                "outputSchema": t.outputSchema or {},
                "category": category,
                "status": "Active"
            })
        return formatted_tools
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch MCP tools: {str(e)}"
        )


@router.post("/tools/execute")
async def execute_mcp_tool(
    request: Request,
    payload: ExecutionRequest,
    username: str = Depends(verify_admin_access)
):
    """Executes a tool on the MCP server dynamically with environmental credentials mapping."""
    tool_name = payload.tool_name
    arguments = payload.arguments

    # Check if tool exists
    try:
        tools = await mcp.list_tools()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to query MCP tools catalog: {str(e)}"
        )

    tool_names = [t.name for t in tools]
    if tool_name not in tool_names:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tool '{tool_name}' not found on the MCP server"
        )

    # Resolve context header details for credential mapping
    auth_api_key = request.headers.get("X-API-Key", "")
    auth_jwt = request.headers.get("Authorization", "")
    if auth_jwt.lower().startswith("bearer "):
        auth_jwt = auth_jwt.split(" ", 1)[1].strip()

    # Backup existing environment variables
    old_api_key = os.environ.get("BACKEND_API_KEY")
    old_jwt = os.environ.get("BACKEND_JWT")
    old_url = os.environ.get("BACKEND_URL")

    # Temporarily overlay credentials
    os.environ["BACKEND_API_KEY"] = auth_api_key
    os.environ["BACKEND_JWT"] = auth_jwt
    
    # Resolve host port
    host_port = 8000
    if request.url.port:
        host_port = request.url.port
    os.environ["BACKEND_URL"] = f"http://127.0.0.1:{host_port}"

    start_time = time.perf_counter()
    status_val = "success"
    error_message = None
    result = None

    try:
        # Call tool on mcp server
        res = await mcp.call_tool(tool_name, arguments)
        
        # Parse tuple results
        content_list = res[0]
        result_data = []
        for c in content_list:
            if hasattr(c, "model_dump"):
                result_data.append(c.model_dump())
            elif hasattr(c, "dict"):
                result_data.append(c.dict())
            else:
                # Fallback dictionary conversion or string representation
                result_data.append({"type": "text", "text": str(c)})
        
        result = {
            "status": "success",
            "content": result_data,
            "meta": res[1] if len(res) > 1 else {}
        }
    except Exception as e:
        status_val = "error"
        error_message = str(e)
        result = {
            "status": "error",
            "message": error_message
        }
    finally:
        # Restore environment variables
        if old_api_key is not None:
            os.environ["BACKEND_API_KEY"] = old_api_key
        else:
            os.environ.pop("BACKEND_API_KEY", None)

        if old_jwt is not None:
            os.environ["BACKEND_JWT"] = old_jwt
        else:
            os.environ.pop("BACKEND_JWT", None)

        if old_url is not None:
            os.environ["BACKEND_URL"] = old_url
        else:
            os.environ.pop("BACKEND_URL", None)

        end_time = time.perf_counter()
        duration_ms = (end_time - start_time) * 1000.0

        # Log details to table
        log_tool_execution(tool_name, duration_ms, status_val, error_message)

    if status_val == "error":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result
        )

    return result


@router.get("/tools/statistics")
def get_mcp_statistics(username: str = Depends(verify_admin_access)):
    """Computes total, average execution duration and success rates per tool and system wide."""
    try:
        with get_db_connection() as conn:
            # Query tool level stats
            rows = conn.execute(
                """
                SELECT 
                    tool_name,
                    COUNT(*) as usage_count,
                    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
                    AVG(duration_ms) as avg_duration
                FROM mcp_tool_activity
                GROUP BY tool_name
                """
            ).fetchall()
            
            tool_stats = {}
            total_runs = 0
            total_success = 0
            sum_durations = 0.0

            for r in rows:
                t_name = r["tool_name"]
                count = r["usage_count"]
                succ_count = r["success_count"]
                avg_dur = r["avg_duration"]

                success_rate = (succ_count / count) * 100.0 if count > 0 else 100.0
                
                tool_stats[t_name] = {
                    "tool_name": t_name,
                    "usage_count": count,
                    "success_rate": round(success_rate, 2),
                    "avg_execution_time": round(avg_dur, 2)
                }

                total_runs += count
                total_success += succ_count
                sum_durations += (avg_dur * count)

            # Query overall totals
            overall_success_rate = (total_success / total_runs) * 100.0 if total_runs > 0 else 100.0
            overall_avg_duration = sum_durations / total_runs if total_runs > 0 else 0.0

            # Get list of all tools from MCP to ensure we report 0s for untouched ones
            try:
                # We do standard asyncio run inside if we are in sync, or we can just import tools list
                # Since this function is sync, we run list_tools synchronously via event loop if available
                # Or simply pre-populate from keys of TOOL_CATEGORIES
                all_tool_names = list(TOOL_CATEGORIES.keys())
            except Exception:
                all_tool_names = []

            for name in all_tool_names:
                if name not in tool_stats:
                    tool_stats[name] = {
                        "tool_name": name,
                        "usage_count": 0,
                        "success_rate": 100.0,
                        "avg_execution_time": 0.0
                    }

            return {
                "overall": {
                    "total_usage_count": total_runs,
                    "overall_success_rate": round(overall_success_rate, 2),
                    "overall_avg_execution_time": round(overall_avg_duration, 2)
                },
                "tools": list(tool_stats.values())
            }

    except sqlite3.Error as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database statistics aggregation failure: {str(e)}"
        )
