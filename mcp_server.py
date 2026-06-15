import os
import sys
from typing import Any, Dict, List, Optional
from mcp.server.fastmcp import FastMCP
from tc_api_client import TeamcenterClient

# Initialize FastMCP Server
mcp = FastMCP("Teamcenter AI Copilot MCP Server")


def get_client() -> TeamcenterClient:
    """Helper to initialize the Teamcenter REST API Wrapper Client.

    Reads variables from environment variables supplied by the parent process.
    """
    base_url = os.getenv("BACKEND_URL", "http://127.0.0.1:8000")
    api_key = os.getenv("BACKEND_API_KEY", "")
    jwt_token = os.getenv("BACKEND_JWT", "")
    return TeamcenterClient(base_url=base_url, api_key=api_key, jwt_token=jwt_token)


@mcp.tool()
def search_items(item_id: str) -> dict:
    """Searches for a specific item in Teamcenter by its ID.

    Args:
        item_id: The exact ID of the item to find.
    """
    if not item_id or not item_id.strip():
        return {"status": "error", "message": "item_id parameter must be a non-empty string"}
    return get_client().request("POST", "/item/search", json={"item_id": item_id.strip()})


@mcp.tool()
def get_item(item_id: str) -> dict:
    """Retrieves full details of a Teamcenter item including its revisions, datasets, and workflows.

    Args:
        item_id: The exact ID of the item to retrieve details for.
    """
    if not item_id or not item_id.strip():
        return {"status": "error", "message": "item_id parameter must be a non-empty string"}
    path = f"/search/item-id?query={item_id.strip()}&exact=true"
    return get_client().request("GET", path)


@mcp.tool()
def create_item(
    item_id: str,
    item_name: str = "",
    item_description: str = "",
    revision_id: str = "A",
) -> dict:
    """Creates a new item in the Teamcenter database.

    Args:
        item_id: The unique ID of the item (e.g. VALVE_200).
        item_name: The display name of the item.
        item_description: A brief description of the item.
        revision_id: Initial revision (defaults to 'A').
    """
    if not item_id or not item_id.strip():
        return {"status": "error", "message": "item_id parameter must be a non-empty string"}
    return get_client().request(
        "POST",
        "/item/add",
        json={
            "item_id": item_id.strip(),
            "item_name": item_name,
            "item_description": item_description,
            "revision_id": revision_id,
        },
    )


@mcp.tool()
def update_item(
    item_id: str,
    item_name: Optional[str] = None,
    item_description: Optional[str] = None,
) -> dict:
    """Updates an existing item's name and/or description in Teamcenter.

    Args:
        item_id: The exact ID of the item to update.
        item_name: New name of the item (optional).
        item_description: New description of the item (optional).
    """
    if not item_id or not item_id.strip():
        return {"status": "error", "message": "item_id parameter must be a non-empty string"}
    return get_client().request(
        "POST",
        "/item/update",
        json={
            "item_id": item_id.strip(),
            "item_name": item_name,
            "item_description": item_description,
        },
    )


@mcp.tool()
def delete_item(item_id: str) -> dict:
    """Deletes an item and all its associated datasets, revisions, and workflows.

    Args:
        item_id: The exact ID of the item to delete.
    """
    if not item_id or not item_id.strip():
        return {"status": "error", "message": "item_id parameter must be a non-empty string"}
    return get_client().request("POST", "/item/delete", json={"item_id": item_id.strip()})


@mcp.tool()
def get_bom(item_id: str) -> dict:
    """Retrieves the direct BOM (Bill of Materials) child components of a parent item.

    Args:
        item_id: The ID of the parent item.
    """
    if not item_id or not item_id.strip():
        return {"status": "error", "message": "item_id parameter must be a non-empty string"}
    return get_client().request("POST", "/bom/get", json={"item_id": item_id.strip()})


@mcp.tool()
def expand_bom(item_id: str) -> dict:
    """Recursively expands the entire BOM (Bill of Materials) hierarchy for a parent item.

    Args:
        item_id: The ID of the parent item to expand.
    """
    if not item_id or not item_id.strip():
        return {"status": "error", "message": "item_id parameter must be a non-empty string"}
    return get_client().request("POST", "/bom/expand", json={"item_id": item_id.strip()})


@mcp.tool()
def create_workflow(
    workflow_id: str,
    workflow_name: str,
    item_id: str,
    revision_id: str,
    workflow_status: str = "Draft",
) -> dict:
    """Creates a new workflow process and links it to an item revision.

    Args:
        workflow_id: Unique ID of the workflow.
        workflow_name: Name of the workflow process.
        item_id: ID of the item.
        revision_id: Specific revision of the item to attach (e.g. A).
        workflow_status: Status (defaults to 'Draft').
    """
    if not workflow_id or not workflow_id.strip():
        return {"status": "error", "message": "workflow_id must be specified"}
    if not workflow_name or not workflow_name.strip():
        return {"status": "error", "message": "workflow_name must be specified"}
    if not item_id or not item_id.strip():
        return {"status": "error", "message": "item_id must be specified"}
    if not revision_id or not revision_id.strip():
        return {"status": "error", "message": "revision_id must be specified"}

    return get_client().request(
        "POST",
        "/workflow/add",
        json={
            "workflow_id": workflow_id.strip(),
            "workflow_name": workflow_name.strip(),
            "item_id": item_id.strip(),
            "revision_id": revision_id.strip(),
            "workflow_status": workflow_status,
        },
    )


@mcp.tool()
def approve_workflow(workflow_id: str) -> dict:
    """Approves a workflow process, setting its status to 'Approved'.

    Args:
        workflow_id: The exact ID of the workflow to approve.
    """
    if not workflow_id or not workflow_id.strip():
        return {"status": "error", "message": "workflow_id parameter must be specified"}
    return get_client().request(
        "POST", "/workflow/approve", json={"workflow_id": workflow_id.strip()}
    )


@mcp.tool()
def search_datasets(item_id: Optional[str] = None) -> dict:
    """Searches for datasets in Teamcenter, optionally filtered by a specific item ID.

    Args:
        item_id: The exact ID of the item to filter datasets (optional).
    """
    payload = {}
    if item_id and item_id.strip():
        payload["item_id"] = item_id.strip()
    return get_client().request("POST", "/dataset/list", json=payload)


@mcp.tool()
def download_dataset(dataset_id: str) -> dict:
    """Retrieves download information or simulated content file for a dataset.

    Args:
        dataset_id: The unique ID of the dataset.
    """
    if not dataset_id or not dataset_id.strip():
        return {"status": "error", "message": "dataset_id parameter must be specified"}

    res = get_client().request("GET", f"/dataset/download/{dataset_id.strip()}")
    if isinstance(res, bytes):
        try:
            return {"dataset_id": dataset_id, "content": res.decode("utf-8")}
        except UnicodeDecodeError:
            return {"dataset_id": dataset_id, "content_type": "binary", "size": len(res)}
    return res


@mcp.tool()
def tc_call_raw(
    service_name: str,
    operation_name: str,
    method: str = "POST",
    payload: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
    params: Optional[Dict[str, Any]] = None,
    timeout: int = 10,
    max_retries: int = 3,
) -> dict:
    """Calls the generic Teamcenter raw endpoint for any service and operation."""
    if not service_name or not service_name.strip():
        return {"status": "error", "message": "service_name is required."}
    if not operation_name or not operation_name.strip():
        return {"status": "error", "message": "operation_name is required."}

    return get_client().request(
        "POST",
        "/api/teamcenter/raw",
        json={
            "service_name": service_name.strip(),
            "operation_name": operation_name.strip(),
            "method": method.upper().strip(),
            "headers": headers,
            "params": params,
            "payload": payload,
            "timeout": timeout,
            "max_retries": max_retries,
        },
    )


@mcp.tool()
def search_teamcenter_api(keyword: str) -> dict:
    """Searches the Teamcenter API catalog by keyword."""
    if not keyword or not keyword.strip():
        return {"status": "error", "message": "Keyword is required."}

    return get_client().request(
        "POST",
        "/api/explorer/search",
        json={"keyword": keyword.strip()},
    )


@mcp.tool()
def get_api_details(service_name: str, operation_name: str) -> dict:
    """Retrieves metadata details for a specific Teamcenter service and operation."""
    if not service_name or not service_name.strip():
        return {"status": "error", "message": "service_name is required."}
    if not operation_name or not operation_name.strip():
        return {"status": "error", "message": "operation_name is required."}

    return get_client().request(
        "GET",
        f"/api/explorer/operation/{service_name.strip()}/{operation_name.strip()}",
    )


@mcp.tool()
def get_user_details() -> dict:
    """Retrieves the current user's profile and message limits."""
    client = get_client()
    profile = client.request("GET", "/user/profile")
    usage = client.request("GET", "/chat/usage")
    return {"profile": profile, "usage": usage}


def _attempt_teamcenter_paths(method: str, paths: List[str], json: Optional[Dict[str, Any]] = None) -> dict:
    """Try a list of likely Teamcenter endpoints, returning the first sensible response."""
    last_response = {"status": "error", "message": "No supported Teamcenter endpoint responded."}
    for path in paths:
        try:
            if method == "GET":
                response = get_client().request(method, path)
            else:
                response = get_client().request(method, path, json=json)
        except Exception as exc:
            last_response = {"status": "error", "message": str(exc)}
            continue

        if not isinstance(response, dict):
            return {"status": "success", "result": response}
        if response.get("status") == "success" or any(key in response for key in ["query", "queries", "saved_queries", "favorites", "user", "sessionId", "session_id"]):
            return response
        last_response = response
    return last_response


@mcp.tool()
def get_session_info() -> dict:
    """Returns Teamcenter session metadata for the current authenticated user."""
    response = _attempt_teamcenter_paths(
        "GET",
        ["/user/session", "/session/info", "/api/session", "/session", "/api/user/session"],
    )
    if response.get("status") == "error":
        return response

    normalized = {
        "user": response.get("user") or response.get("username") or response.get("user_name") or "",
        "group": response.get("group") or response.get("group_name") or response.get("team") or "",
        "role": response.get("role") or response.get("roles") or "",
        "sessionId": response.get("sessionId") or response.get("session_id") or response.get("session") or "",
    }
    return normalized


@mcp.tool()
def get_saved_queries() -> dict:
    """Returns Teamcenter saved queries for the current authenticated user."""
    response = _attempt_teamcenter_paths(
        "GET",
        ["/saved-queries", "/query/saved", "/savedqueries", "/api/saved-queries", "/api/query/saved"],
    )
    if response.get("status") == "error":
        return response

    # Normalize common saved query fields
    queries = response.get("saved_queries") or response.get("queries") or response.get("items") or response.get("results")
    if queries is None and isinstance(response, dict):
        queries = [response]
    return {"status": "success", "saved_queries": queries}


@mcp.tool()
def get_favorites() -> dict:
    """Returns Teamcenter favorite objects for the current authenticated user."""
    response = _attempt_teamcenter_paths(
        "GET",
        ["/favorites", "/favorite", "/api/favorites", "/api/favorite"],
    )
    if response.get("status") == "error":
        return response

    favorites = response.get("favorites") or response.get("items") or response.get("results")
    if favorites is None and isinstance(response, dict):
        favorites = [response]
    return {"status": "success", "favorites": favorites}


@mcp.tool()
def show_system_capabilities() -> str:
    """Lists the system features and available tools."""
    return (
        "I am a friendly and intelligent Teamcenter AI assistant designed to help you interact with Siemens Teamcenter PLM and general coding topics naturally.\n\n"
        "Here are the capabilities I can assist you with:\n"
        "- **Item & Revision Management**: I can create new items, search for existing items, list items, and update details or delete items in the database.\n"
        "- **Data Structures**: I can add, list, or delete Datasets, Item Revisions, and Workflows associated with items.\n"
        "- **BOM & Structure**: I can retrieve or recursively expand the Bill of Materials (BOM) hierarchy for assemblies.\n"
        "- **Profile & Session details**: I can show you your profile details, persistent API keys, and daily token usage.\n"
        "- **General Assistance**: I can also help with programming concepts, general software engineering, and write code snippets.\n\n"
        "Feel free to ask me to perform any of these tasks or ask questions about Siemens Teamcenter PLM!"
    )


# --- Metadata Discovery ---

@mcp.tool()
def get_object_types() -> dict:
    """Lists all supported object types in the metadata catalog (e.g. Item, ItemRevision)."""
    return get_client().request("GET", "/api/metadata/types")


@mcp.tool()
def get_property_schema(type_name: str) -> dict:
    """Retrieves properties and relationship schema for the specified object type.

    Args:
        type_name: The exact name of the object type (e.g. Item, Folder).
    """
    if not type_name or not type_name.strip():
        return {"status": "error", "message": "type_name parameter must be specified"}
    return get_client().request("GET", f"/api/metadata/types/{type_name.strip()}")


@mcp.tool()
def get_relationships() -> dict:
    """Lists relationships configured between all object types."""
    return get_client().request("GET", "/api/metadata/relationships")


# --- Property Retrieval ---

@mcp.tool()
def get_property(object_type: str, object_id: str, property_name: str) -> dict:
    """Retrieves a single property value for a specified Teamcenter object.

    Args:
        object_type: Type of the object (e.g. Item, Dataset, Form, Folder).
        object_id: Unique ID of the object.
        property_name: Name of the property to query.
    """
    if not object_type or not object_type.strip():
        return {"status": "error", "message": "object_type must be specified"}
    if not object_id or not object_id.strip():
        return {"status": "error", "message": "object_id must be specified"}
    if not property_name or not property_name.strip():
        return {"status": "error", "message": "property_name must be specified"}
    
    path = f"/api/properties/property?object_type={object_type.strip()}&object_id={object_id.strip()}&property_name={property_name.strip()}"
    return get_client().request("GET", path)


@mcp.tool()
def get_properties(object_type: str, object_id: str, property_list: list) -> dict:
    """Retrieves a list of specified property values for a specified Teamcenter object.

    Args:
        object_type: Type of the object (e.g. Item, Dataset, Form, Folder).
        object_id: Unique ID of the object.
        property_list: List of property names to query.
    """
    if not object_type or not object_type.strip():
        return {"status": "error", "message": "object_type must be specified"}
    if not object_id or not object_id.strip():
        return {"status": "error", "message": "object_id must be specified"}
    if not property_list:
        return {"status": "error", "message": "property_list must be a non-empty list"}
    
    return get_client().request(
        "POST",
        "/api/properties/batch",
        json={
            "object_type": object_type.strip(),
            "object_id": object_id.strip(),
            "properties": property_list,
        },
    )


@mcp.tool()
def get_all_properties(object_type: str, object_id: str) -> dict:
    """Retrieves all property values for a specified Teamcenter object.

    Args:
        object_type: Type of the object (e.g. Item, Dataset, Form, Folder).
        object_id: Unique ID of the object.
    """
    if not object_type or not object_type.strip():
        return {"status": "error", "message": "object_type must be specified"}
    if not object_id or not object_id.strip():
        return {"status": "error", "message": "object_id must be specified"}
    
    path = f"/api/properties/all?object_type={object_type.strip()}&object_id={object_id.strip()}"
    return get_client().request("GET", path)


# --- Advanced Search ---

@mcp.tool()
def advanced_search(
    query: Optional[str] = None,
    filters: Optional[dict] = None,
    sort_by: str = "relevance",
    sort_order: str = "desc",
    limit: int = 10,
    offset: int = 0,
) -> dict:
    """Executes advanced search queries on the Teamcenter database.

    Args:
        query: Optional search keyword query string.
        filters: Optional filters dictionary (contains type, owner, status, start_date, end_date).
        sort_by: Sort parameter (relevance, createdAt, updatedAt, id, name).
        sort_order: Sort direction (asc or desc).
        limit: Pagination result limit.
        offset: Pagination offset index.
    """
    return get_client().request(
        "POST",
        "/api/advanced-search/query",
        json={
            "query": query,
            "filters": filters or {},
            "sort_by": sort_by,
            "sort_order": sort_order,
            "limit": limit,
            "offset": offset,
        },
    )


@mcp.tool()
def search_workflows(item_id: Optional[str] = None) -> dict:
    """Searches workflows in the database, optionally filtering by associated item ID.

    Args:
        item_id: The exact ID of the item to filter workflows (optional).
    """
    payload = {}
    if item_id and item_id.strip():
        payload["item_id"] = item_id.strip()
    return get_client().request("POST", "/workflow/list", json=payload)


# --- Health Monitoring ---

@mcp.tool()
def check_teamcenter_health() -> dict:
    """Retrieves deep health diagnostics and latency metrics reports."""
    return get_client().request("GET", "/teamcenter/health")


@mcp.tool()
def check_sessions() -> dict:
    """Retrieves session health parameters (active and expired session counts)."""
    res = get_client().request("GET", "/teamcenter/health")
    if isinstance(res, dict) and "metrics" in res:
        return res["metrics"].get("session_health", {})
    return res


@mcp.tool()
def check_authentication() -> dict:
    """Retrieves authentication and configuration status health details."""
    res = get_client().request("GET", "/teamcenter/health")
    if isinstance(res, dict) and "metrics" in res:
        return res["metrics"].get("authentication_health", {})
    return res


# --- API Discovery ---

@mcp.tool()
def list_available_apis(category: Optional[str] = None) -> dict:
    """Lists registered Teamcenter REST endpoints from the API Catalog.

    Args:
        category: Filter catalog by category (e.g. Items, Datasets, BOM, Workflow, Users, Projects).
    """
    path = "/api/catalog"
    if category and category.strip():
        path += f"?category={category.strip()}"
    return get_client().request("GET", path)


@mcp.tool()
def search_api_catalog(query: str) -> dict:
    """Performs search across catalogued endpoint names, categories, and descriptions.

    Args:
        query: Search term to match.
    """
    if not query or not query.strip():
        return {"status": "error", "message": "query parameter must be specified"}
    return get_client().request("GET", f"/api/catalog?q={query.strip()}")


if __name__ == "__main__":
    mcp.run()
