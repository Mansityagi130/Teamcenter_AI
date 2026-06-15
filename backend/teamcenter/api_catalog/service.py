import os
import sqlite3
import logging
from typing import Any, Dict, List, Optional
from services.database import get_database_path
from .exceptions import EndpointNotFoundException

logger = logging.getLogger("teamcenter.api_catalog")

# Predefined Teamcenter API endpoints catalog metadata
PREDEFINED_CATALOG = [
    {
        "method": "POST",
        "endpoint": "/item/search",
        "category": "Items",
        "description": "Searches for Teamcenter items by ID or name.",
        "parameters": {
            "query": {"type": "String", "required": True, "description": "Search keyword matching ID or name."}
        }
    },
    {
        "method": "POST",
        "endpoint": "/item/add",
        "category": "Items",
        "description": "Adds a new Item and revision to the database.",
        "parameters": {
            "item_id": {"type": "String", "required": True, "description": "Unique ID of the new item."},
            "item_name": {"type": "String", "required": True, "description": "Display name of the item."},
            "item_description": {"type": "String", "required": False, "description": "Description of the item."}
        }
    },
    {
        "method": "POST",
        "endpoint": "/item/list",
        "category": "Items",
        "description": "Lists registered Items.",
        "parameters": {}
    },
    {
        "method": "POST",
        "endpoint": "/item/update",
        "category": "Items",
        "description": "Updates properties of an existing Item.",
        "parameters": {
            "item_id": {"type": "String", "required": True, "description": "Target item ID to update."},
            "item_name": {"type": "String", "required": False, "description": "New display name."},
            "item_description": {"type": "String", "required": False, "description": "New description."}
        }
    },
    {
        "method": "POST",
        "endpoint": "/item/delete",
        "category": "Items",
        "description": "Deletes an Item from the database.",
        "parameters": {
            "item_id": {"type": "String", "required": True, "description": "Target item ID to delete."}
        }
    },
    {
        "method": "POST",
        "endpoint": "/dataset/add",
        "category": "Datasets",
        "description": "Registers a new Dataset reference.",
        "parameters": {
            "dataset_id": {"type": "String", "required": True, "description": "Unique Dataset ID."},
            "dataset_name": {"type": "String", "required": True, "description": "Name of the dataset."},
            "item_id": {"type": "String", "required": True, "description": "Parent item ID reference."}
        }
    },
    {
        "method": "POST",
        "endpoint": "/dataset/update",
        "category": "Datasets",
        "description": "Modifies attributes of an existing Dataset.",
        "parameters": {
            "dataset_id": {"type": "String", "required": True, "description": "Target Dataset ID to update."},
            "dataset_name": {"type": "String", "required": True, "description": "New dataset name."}
        }
    },
    {
        "method": "POST",
        "endpoint": "/dataset/delete",
        "category": "Datasets",
        "description": "Deletes a Dataset reference.",
        "parameters": {
            "dataset_id": {"type": "String", "required": True, "description": "Target Dataset ID to delete."}
        }
    },
    {
        "method": "POST",
        "endpoint": "/dataset/list",
        "category": "Datasets",
        "description": "Lists Dataset records.",
        "parameters": {}
    },
    {
        "method": "GET",
        "endpoint": "/dataset/download/{dataset_id}",
        "category": "Datasets",
        "description": "Simulates downloading the file associated with a Dataset.",
        "parameters": {
            "dataset_id": {"type": "String", "required": True, "description": "Target Dataset ID to download."}
        }
    },
    {
        "method": "POST",
        "endpoint": "/bom/get",
        "category": "BOM",
        "description": "Retrieves direct BOM assembly children.",
        "parameters": {
            "parent_item_id": {"type": "String", "required": True, "description": "Parent assembly Item ID."}
        }
    },
    {
        "method": "POST",
        "endpoint": "/bom/expand",
        "category": "BOM",
        "description": "Recursively expands the entire assembly BOM structure.",
        "parameters": {
            "parent_item_id": {"type": "String", "required": True, "description": "Parent assembly Item ID."}
        }
    },
    {
        "method": "POST",
        "endpoint": "/workflow/add",
        "category": "Workflow",
        "description": "Submits a new workflow process instance.",
        "parameters": {
            "workflow_id": {"type": "String", "required": True, "description": "Unique workflow ID."},
            "workflow_name": {"type": "String", "required": True, "description": "Name of the process template."},
            "revision_row_id": {"type": "Integer", "required": True, "description": "Target Revision Row ID."}
        }
    },
    {
        "method": "POST",
        "endpoint": "/workflow/update",
        "category": "Workflow",
        "description": "Modifies workflow status or attributes.",
        "parameters": {
            "workflow_id": {"type": "String", "required": True, "description": "Target workflow ID."},
            "workflow_status": {"type": "String", "required": True, "description": "New status value."}
        }
    },
    {
        "method": "POST",
        "endpoint": "/workflow/delete",
        "category": "Workflow",
        "description": "Removes a workflow process instance.",
        "parameters": {
            "workflow_id": {"type": "String", "required": True, "description": "Target workflow ID to delete."}
        }
    },
    {
        "method": "POST",
        "endpoint": "/workflow/list",
        "category": "Workflow",
        "description": "Lists workflow processes.",
        "parameters": {}
    },
    {
        "method": "POST",
        "endpoint": "/workflow/approve",
        "category": "Workflow",
        "description": "Approves a workflow process, setting it to Released.",
        "parameters": {
            "workflow_id": {"type": "String", "required": True, "description": "Target workflow ID to approve."}
        }
    },
    {
        "method": "POST",
        "endpoint": "/signup",
        "category": "Users",
        "description": "Creates a new user profile.",
        "parameters": {
            "username": {"type": "String", "required": True, "description": "Unique username."},
            "password": {"type": "String", "required": True, "description": "Password string."}
        }
    },
    {
        "method": "POST",
        "endpoint": "/login",
        "category": "Users",
        "description": "Authenticates credentials and returns a JWT token.",
        "parameters": {
            "username": {"type": "String", "required": True, "description": "Registered username."},
            "password": {"type": "String", "required": True, "description": "Password string."}
        }
    },
    {
        "method": "POST",
        "endpoint": "/generate-api-key",
        "category": "Users",
        "description": "Generates an API key for REST integrations.",
        "parameters": {}
    },
    {
        "method": "GET",
        "endpoint": "/users",
        "category": "Users",
        "description": "Lists registered usernames.",
        "parameters": {}
    },
    {
        "method": "GET",
        "endpoint": "/project/list",
        "category": "Projects",
        "description": "Lists configured Teamcenter projects.",
        "parameters": {}
    },
    {
        "method": "POST",
        "endpoint": "/project/assign",
        "category": "Projects",
        "description": "Assigns objects to projects for security classification.",
        "parameters": {
            "project_id": {"type": "String", "required": True, "description": "Target Project ID."},
            "object_id": {"type": "String", "required": True, "description": "Target object ID (e.g. Item ID)."}
        }
    }
]


class TeamcenterApiCatalog:
    """API Catalog Service representing registered endpoints, schema parameters, and usage stats."""

    def __init__(self, db_path: Optional[str] = None):
        if db_path is None:
            db_path = str(get_database_path())
        self.db_path = db_path

    def _get_db_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def get_catalog(self, category: Optional[str] = None, q: Optional[str] = None) -> List[Dict[str, Any]]:
        """Lists registered endpoints with optional filtering by category and search keyword."""
        results = []
        category = category.strip().lower() if category else None
        q = q.strip().lower() if q else None

        for entry in PREDEFINED_CATALOG:
            # Filter by category
            if category and entry["category"].lower() != category:
                continue
            # Search by keyword
            if q and not (
                q in entry["endpoint"].lower() or 
                q in entry["category"].lower() or 
                q in entry["description"].lower()
            ):
                continue
            
            # Return basic metadata (exclude parameters for list view)
            results.append({
                "method": entry["method"],
                "endpoint": entry["endpoint"],
                "category": entry["category"],
                "description": entry["description"]
            })

        logger.info(f"action=get_catalog status=success category={category} query={q} results_count={len(results)}")
        return results

    def get_api_metadata(self, method: str, endpoint: str) -> Dict[str, Any]:
        """Retrieves full documentation and parameter definitions for a target endpoint."""
        method = method.strip().upper()
        endpoint = endpoint.strip()

        for entry in PREDEFINED_CATALOG:
            if entry["method"] == method and entry["endpoint"] == endpoint:
                logger.info(f"action=get_api_metadata status=success method={method} endpoint={endpoint}")
                return entry

        logger.error(f"action=get_api_metadata status=error error=endpoint_not_found method={method} endpoint={endpoint}")
        raise EndpointNotFoundException(f"Endpoint '{method} {endpoint}' not found in API Catalog.")

    def get_usage_statistics(self, method: str, endpoint: str) -> Dict[str, Any]:
        """Retrieves invocation metrics for a specific endpoint from SQLite activity logs."""
        # Verify endpoint exists
        self.get_api_metadata(method, endpoint)

        invocation_count = 0
        unique_users_count = 0
        last_invoked_at = "Never"

        try:
            with self._get_db_connection() as conn:
                # Query invocation count
                cursor = conn.execute(
                    "SELECT COUNT(*) FROM activity_logs WHERE endpoint = ?",
                    (endpoint,)
                )
                invocation_count = cursor.fetchone()[0]

                if invocation_count > 0:
                    # Query unique users count
                    cursor = conn.execute(
                        "SELECT COUNT(DISTINCT user_id) FROM activity_logs WHERE endpoint = ?",
                        (endpoint,)
                    )
                    unique_users_count = cursor.fetchone()[0]

                    # Query last invoked timestamp
                    cursor = conn.execute(
                        "SELECT MAX(timestamp) FROM activity_logs WHERE endpoint = ?",
                        (endpoint,)
                    )
                    last_invoked_at = str(cursor.fetchone()[0]).strip()
        except sqlite3.Error as e:
            logger.error(f"action=get_usage_statistics status=error method={method} endpoint={endpoint} error={str(e)}")
            # Fail silently returning 0 counters if database fails

        logger.info(f"action=get_usage_statistics status=success method={method} endpoint={endpoint} count={invocation_count}")
        return {
            "method": method,
            "endpoint": endpoint,
            "invocation_count": invocation_count,
            "unique_users_count": unique_users_count,
            "last_invoked_at": last_invoked_at
        }

    def get_all_usage_statistics(self) -> Dict[str, Any]:
        """Compiles usage statistics for all registered endpoints in the catalog."""
        stats = {}
        try:
            with self._get_db_connection() as conn:
                for entry in PREDEFINED_CATALOG:
                    endpoint = entry["endpoint"]
                    cursor = conn.execute(
                        "SELECT COUNT(*) FROM activity_logs WHERE endpoint = ?",
                        (endpoint,)
                    )
                    count = cursor.fetchone()[0]
                    stats[endpoint] = {
                        "method": entry["method"],
                        "invocation_count": count
                    }
        except sqlite3.Error as e:
            logger.error(f"action=get_all_usage_statistics status=error error={str(e)}")

        logger.info(f"action=get_all_usage_statistics status=success endpoints_count={len(stats)}")
        return stats
