from datetime import datetime
import os
import sqlite3
import time
import logging
from typing import Any, Dict, List, Optional
from services.database import get_database_path
from .exceptions import ObjectTypeNotFoundException, SearchException

logger = logging.getLogger("teamcenter.metadata_explorer")

SUPPORTED_OBJECT_TYPES = {
    "Item": {
        "table": "items",
        "description": "Main product/component design element in Teamcenter."
    },
    "ItemRevision": {
        "table": "revisions",
        "description": "Specific revision version of an Item."
    },
    "Dataset": {
        "table": "datasets",
        "description": "Reference files, CAD components, or specifications attached to Items."
    },
    "Form": {
        "table": "forms",
        "description": "Custom attribute sheets holding technical specs and attributes."
    },
    "Folder": {
        "table": "folders",
        "description": "Hierarchical container to group and organize Teamcenter objects."
    },
    "Workflow": {
        "table": "workflows",
        "description": "Business process workflow tracking approval states and signoffs."
    }
}

RELATIONSHIPS = [
    {
        "source": "Item",
        "target": "ItemRevision",
        "type": "One-to-Many",
        "description": "An Item owns multiple Revisions."
    },
    {
        "source": "Item",
        "target": "Dataset",
        "type": "One-to-Many",
        "description": "An Item references multiple Datasets."
    },
    {
        "source": "ItemRevision",
        "target": "Workflow",
        "type": "One-to-Many",
        "description": "A Workflow runs on an ItemRevision."
    }
]

DATASET_TYPES = ["PDF", "DirectModel", "Text", "UGPart", "Word", "Excel"]
WORKFLOW_TYPES = ["Release Process", "Change Process", "Review Process", "Fast-Track Release"]


class TeamcenterMetadataService:
    """Central metadata discovery engine for dynamic object schema and relationships."""

    def __init__(self, db_path: Optional[str] = None, cache_ttl_seconds: int = 60):
        if db_path is None:
            db_path = str(get_database_path())
        self.db_path = db_path
        self.cache_ttl_seconds = cache_ttl_seconds
        
        # Cache stores values as: key -> (value, insertion_time)
        self.cache: Dict[Any, tuple] = {}

    def _get_db_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _get_cached_value(self, cache_key: Any) -> Optional[Any]:
        if cache_key in self.cache:
            val, timestamp = self.cache[cache_key]
            if time.time() - timestamp < self.cache_ttl_seconds:
                return val
            else:
                del self.cache[cache_key]
        return None

    def _set_cached_value(self, cache_key: Any, value: Any) -> None:
        self.cache[cache_key] = (value, time.time())

    def get_object_types(self) -> List[str]:
        """Returns the list of supported object types."""
        return list(SUPPORTED_OBJECT_TYPES.keys())

    def get_relationships(self) -> List[Dict[str, Any]]:
        """Returns relationships between object types."""
        return RELATIONSHIPS

    def get_dataset_types(self) -> List[str]:
        """Returns the list of standard dataset types."""
        return DATASET_TYPES

    def get_workflow_types(self) -> List[str]:
        """Returns the list of workflow process types."""
        return WORKFLOW_TYPES

    def get_type_schema(self, object_type: str) -> Dict[str, Any]:
        """Retrieves properties and relationships schema for a specific object type."""
        if object_type not in SUPPORTED_OBJECT_TYPES:
            logger.error(f"action=get_type_schema status=error error=object_type_not_supported type={object_type}")
            raise ObjectTypeNotFoundException(f"ObjectType '{object_type}' is not supported.")

        cache_key = f"schema:{object_type}"
        cached = self._get_cached_value(cache_key)
        if cached:
            logger.info(f"action=get_type_schema status=success type={object_type} cache_hit=true")
            return cached

        meta = SUPPORTED_OBJECT_TYPES[object_type]
        table_name = meta["table"]
        properties = []

        try:
            with self._get_db_connection() as conn:
                cursor = conn.execute(f"PRAGMA table_info({table_name})")
                columns = cursor.fetchall()
                
            for col in columns:
                # Map SQL types to generic programmer-friendly types
                sql_type = str(col["type"]).upper()
                if "INT" in sql_type:
                    prop_type = "Integer"
                elif "BLOB" in sql_type:
                    prop_type = "Binary"
                elif "DATE" in sql_type or "TIME" in sql_type:
                    prop_type = "DateTime"
                else:
                    prop_type = "String"
                
                # Column is required if it is set as notnull or is a primary key column
                is_required = bool(col["notnull"]) or bool(col["pk"])
                
                properties.append({
                    "name": col["name"],
                    "type": prop_type,
                    "required": is_required
                })

        except sqlite3.Error as e:
            logger.error(f"action=get_type_schema status=error type={object_type} error={str(e)}")
            # Fallback properties definition if database cannot be queried
            properties = [
                {"name": "id", "type": "String", "required": True},
                {"name": "createdAt", "type": "DateTime", "required": True},
                {"name": "updatedAt", "type": "DateTime", "required": True},
                {"name": "createdBy", "type": "String", "required": False}
            ]

        # Gather relationships where this object type is the source
        rels = [
            {
                "target": r["target"],
                "type": r["type"],
                "description": r["description"]
            }
            for r in RELATIONSHIPS if r["source"] == object_type
        ]

        result = {
            "object_type": object_type,
            "description": meta["description"],
            "table_name": table_name,
            "properties": properties,
            "relationships": rels
        }

        self._set_cached_value(cache_key, result)
        logger.info(f"action=get_type_schema status=success type={object_type} cache_hit=false")
        return result

    def search_metadata(self, query: str) -> Dict[str, Any]:
        """Searches metadata catalog (object types, property names, relationship descriptions)."""
        if not query or not query.strip():
            raise SearchException("Search query cannot be empty.")
            
        term = query.strip().lower()
        
        cache_key = f"search:{term}"
        cached = self._get_cached_value(cache_key)
        if cached:
            logger.info(f"action=search_metadata status=success query='{term}' cache_hit=true")
            return cached

        matched_types = []
        matched_properties = []
        matched_relationships = []

        # 1. Search object types
        for o_type, meta in SUPPORTED_OBJECT_TYPES.items():
            if term in o_type.lower() or term in meta["description"].lower():
                matched_types.append({
                    "object_type": o_type,
                    "description": meta["description"]
                })

            # 2. Search properties of this object type
            schema = self.get_type_schema(o_type)
            for prop in schema["properties"]:
                if term in prop["name"].lower() or term in prop["type"].lower():
                    matched_properties.append({
                        "object_type": o_type,
                        "property_name": prop["name"],
                        "property_type": prop["type"],
                        "required": prop["required"]
                    })

        # 3. Search relationships
        for rel in RELATIONSHIPS:
            if (term in rel["source"].lower() or 
                term in rel["target"].lower() or 
                term in rel["description"].lower()):
                matched_relationships.append(rel)

        result = {
            "query": query,
            "matched_object_types": matched_types,
            "matched_properties": matched_properties,
            "matched_relationships": matched_relationships
        }

        self._set_cached_value(cache_key, result)
        logger.info(f"action=search_metadata status=success query='{term}' cache_hit=false")
        return result
