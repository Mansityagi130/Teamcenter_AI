from datetime import datetime
import os
import sqlite3
import time
import logging
from typing import Any, Dict, List, Optional
from services.database import get_database_path
from .exceptions import (
    InvalidObjectTypeException,
    ObjectNotFoundException,
    PropertyNotFoundException,
)

logger = logging.getLogger("teamcenter.property_service")

SUPPORTED_OBJECT_TYPES = {
    "Item": {
        "table": "items",
        "key_col": "item_id",
        "properties": {
            "item_id",
            "item_name",
            "item_description",
            "createdAt",
            "updatedAt",
            "createdBy",
        },
    },
    "ItemRevision": {
        "table": "revisions",
        "key_col": "id",  # Can be integer id or compound string 'item_id/revision_id'
        "properties": {
            "id",
            "revision_id",
            "item_id",
            "createdAt",
            "updatedAt",
            "createdBy",
        },
    },
    "Dataset": {
        "table": "datasets",
        "key_col": "dataset_id",
        "properties": {
            "dataset_id",
            "dataset_name",
            "item_id",
            "createdAt",
            "updatedAt",
            "createdBy",
        },
    },
    "Form": {
        "table": "forms",
        "key_col": "form_id",
        "properties": {
            "form_id",
            "form_name",
            "form_type",
            "createdAt",
            "updatedAt",
            "createdBy",
        },
    },
    "Workflow": {
        "table": "workflows",
        "key_col": "workflow_id",
        "properties": {
            "workflow_id",
            "workflow_name",
            "workflow_status",
            "revision_row_id",
            "createdAt",
            "updatedAt",
            "createdBy",
        },
    },
    "Folder": {
        "table": "folders",
        "key_col": "folder_id",
        "properties": {
            "folder_id",
            "folder_name",
            "folder_description",
            "createdAt",
            "updatedAt",
            "createdBy",
        },
    },
}


class TeamcenterPropertyService:
    """Enterprise Property Retrieval Service for dynamic metadata fetching in Teamcenter."""

    def __init__(
        self, db_path: Optional[str] = None, cache_ttl_seconds: int = 60
    ):
        # Resolve DB path
        if db_path is None:
            db_path = str(get_database_path())
        self.db_path = db_path
        self.cache_ttl_seconds = cache_ttl_seconds

        # Cache structure: (object_type, object_id) -> (properties_dict, cache_time)
        self.cache: Dict[tuple, tuple] = {}

    def _get_db_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _validate_object_type(self, object_type: str) -> None:
        if object_type not in SUPPORTED_OBJECT_TYPES:
            logger.error(
                f"action=validate_object_type status=error error=invalid_object_type type={object_type}"
            )
            raise InvalidObjectTypeException(
                f"Unsupported object type '{object_type}'. Supported types: {list(SUPPORTED_OBJECT_TYPES.keys())}"
            )

    def _validate_property(self, object_type: str, property_name: str) -> None:
        valid_props = SUPPORTED_OBJECT_TYPES[object_type]["properties"]
        if property_name not in valid_props:
            logger.error(
                f"action=validate_property status=error error=property_not_found type={object_type} property={property_name}"
            )
            raise PropertyNotFoundException(
                f"Property '{property_name}' is not valid for object type '{object_type}'."
            )

    def _fetch_object_properties(
        self, object_type: str, object_id: str
    ) -> Dict[str, Any]:
        """Queries the SQLite database directly to retrieve all properties of the target object."""
        self._validate_object_type(object_type)
        meta = SUPPORTED_OBJECT_TYPES[object_type]

        query = f"SELECT * FROM {meta['table']} WHERE "
        params = []

        # Special query handling for ItemRevision with compound id 'item_id/revision_id'
        if object_type == "ItemRevision" and "/" in str(object_id):
            item_id, revision_id = str(object_id).split("/", 1)
            query += "item_id = ? AND revision_id = ?"
            params.extend([item_id.strip(), revision_id.strip()])
        else:
            query += f"{meta['key_col']} = ?"
            params.append(object_id)

        try:
            with self._get_db_connection() as conn:
                row = conn.execute(query, tuple(params)).fetchone()

            if not row:
                raise ObjectNotFoundException(
                    f"{object_type} with ID '{object_id}' not found."
                )

            # Convert row to dictionary and sanitize None values to empty strings
            result = {}
            for col in row.keys():
                val = row[col]
                result[col] = "" if val is None else str(val).strip()

            return result

        except sqlite3.Error as e:
            logger.error(
                f"action=database_query status=error error={str(e)} object_type={object_type} object_id={object_id}"
            )
            raise ObjectNotFoundException(
                f"Database error locating {object_type} '{object_id}': {str(e)}"
            )

    def _get_cached_object(
        self, object_type: str, object_id: str
    ) -> Optional[Dict[str, Any]]:
        """Retrieves object property dictionary from cache if valid and non-expired."""
        cache_key = (object_type, object_id)
        if cache_key in self.cache:
            properties, cached_time = self.cache[cache_key]
            # Expiration Check
            if time.time() - cached_time < self.cache_ttl_seconds:
                return properties
            else:
                # Evict expired cache record
                del self.cache[cache_key]
        return None

    def _cache_object(
        self, object_type: str, object_id: str, properties: Dict[str, Any]
    ) -> None:
        cache_key = (object_type, object_id)
        self.cache[cache_key] = (properties, time.time())

    def get_all_properties(
        self, object_type: str, object_id: str
    ) -> Dict[str, Any]:
        """Retrieves all property values for a specified object, using cache if available."""
        start_time = time.time()
        self._validate_object_type(object_type)

        if not object_id or not str(object_id).strip():
            raise ValueError("object_id must be a non-empty string")

        cached_props = self._get_cached_object(object_type, object_id)
        cache_hit = False

        if cached_props:
            properties = cached_props
            cache_hit = True
        else:
            properties = self._fetch_object_properties(object_type, object_id)
            self._cache_object(object_type, object_id, properties)

        duration_ms = (time.time() - start_time) * 1000
        logger.info(
            f"action=get_all_properties status=success object_type={object_type} "
            f"object_id={object_id} duration_ms={duration_ms:.2f} cache_hit={cache_hit}"
        )
        return properties

    def get_property(
        self, object_type: str, object_id: str, property_name: str
    ) -> Any:
        """Retrieves a single property value for a specified object."""
        self._validate_object_type(object_type)
        self._validate_property(object_type, property_name)

        properties = self.get_all_properties(object_type, object_id)
        return properties.get(property_name)

    def get_properties(
        self, object_type: str, object_id: str, property_list: List[str]
    ) -> Dict[str, Any]:
        """Retrieves multiple specified property values for an object."""
        self._validate_object_type(object_type)
        for prop in property_list:
            self._validate_property(object_type, prop)

        all_props = self.get_all_properties(object_type, object_id)
        return {prop: all_props.get(prop) for prop in property_list}
