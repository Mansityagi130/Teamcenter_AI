import os
import sqlite3
import time
import logging
from typing import Any, Dict, List, Optional
from services.database import get_database_path
from .exceptions import InvalidSearchFilterException, SearchExecutionException

logger = logging.getLogger("teamcenter.search_engine")

SUPPORTED_TYPES = {"Item", "ItemRevision", "Dataset", "Form", "Folder", "Workflow"}


class TeamcenterSearchEngine:
    """Advanced Search Engine for executing ranked, filtered, and sorted queries on Teamcenter."""

    def __init__(self, db_path: Optional[str] = None):
        if db_path is None:
            db_path = str(get_database_path())
        self.db_path = db_path

    def _get_db_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _calculate_relevance(self, result: Dict[str, Any], query: str) -> float:
        """Calculates relevance score of a result based on search query matching weights."""
        if not query or not query.strip():
            return 0.0
            
        term = query.lower().strip()
        score = 0.0
        
        res_id = str(result.get("id") or "").lower()
        res_name = str(result.get("name") or "").lower()
        res_desc = str(result.get("description") or "").lower()
        
        # ID Weighting
        if res_id == term:
            score += 100.0
        elif term in res_id:
            score += 50.0
            
        # Name Weighting
        if res_name == term:
            score += 80.0
        elif term in res_name:
            score += 40.0
            
        # Description Weighting
        if term in res_desc:
            score += 10.0
            
        return score

    def search(
        self,
        query: Optional[str] = None,
        filters: Optional[Dict[str, Any]] = None,
        sort_by: str = "relevance",
        sort_order: str = "desc",
        limit: int = 10,
        offset: int = 0
    ) -> Dict[str, Any]:
        """Performs advanced search queries with filtering, sorting, ranking, and pagination."""
        start_time = time.time()
        
        # Sanitize parameters
        filters = filters or {}
        sort_by = (sort_by or "relevance").lower().strip()
        sort_order = (sort_order or "desc").lower().strip()
        limit = max(1, limit)
        offset = max(0, offset)
        
        # Validate Sort Parameters
        valid_sort_fields = {"relevance", "createdat", "updatedat", "id", "name"}
        if sort_by not in valid_sort_fields:
            raise InvalidSearchFilterException(f"Invalid sort field '{sort_by}'. Valid: {list(valid_sort_fields)}")
        if sort_order not in {"asc", "desc"}:
            raise InvalidSearchFilterException("sort_order must be 'asc' or 'desc'")

        # Validate Filters
        type_filter = filters.get("type")
        if type_filter and type_filter not in SUPPORTED_TYPES:
            raise InvalidSearchFilterException(f"Invalid object type filter '{type_filter}'.")

        # Resolve target tables to search
        tables_to_search = [type_filter] if type_filter else list(SUPPORTED_TYPES)
        all_results = []

        try:
            with self._get_db_connection() as conn:
                for obj_type in tables_to_search:
                    results = self._query_table(conn, obj_type, query, filters)
                    all_results.extend(results)
        except sqlite3.Error as e:
            logger.error(f"action=advanced_search status=error error={str(e)}")
            raise SearchExecutionException(f"Database search query execution failed: {str(e)}")

        # Calculate score and rank results
        for res in all_results:
            res["score"] = self._calculate_relevance(res, query) if query else 0.0

        # Filtering in memory for post-processed queries if needed
        # (e.g. status constraints on joined queries are handled in SQL, but we verify here)
        status_filter = filters.get("status")
        if status_filter:
            all_results = [r for r in all_results if r["workflow_status"].lower() == status_filter.lower()]

        # Sorting
        is_reverse = (sort_order == "desc")
        if sort_by == "relevance":
            all_results.sort(key=lambda x: (x["score"], x["createdAt"]), reverse=is_reverse)
        elif sort_by == "createdat":
            all_results.sort(key=lambda x: x["createdAt"], reverse=is_reverse)
        elif sort_by == "updatedat":
            all_results.sort(key=lambda x: x["updatedAt"], reverse=is_reverse)
        elif sort_by == "id":
            all_results.sort(key=lambda x: x["id"], reverse=is_reverse)
        elif sort_by == "name":
            all_results.sort(key=lambda x: x["name"], reverse=is_reverse)

        # Pagination
        total_results = len(all_results)
        paginated_results = all_results[offset : offset + limit]

        duration_ms = (time.time() - start_time) * 1000
        logger.info(
            f"action=advanced_search status=success query='{query}' type_filter='{type_filter}' "
            f"total={total_results} returned={len(paginated_results)} duration_ms={duration_ms:.2f}"
        )

        return {
            "total_results": total_results,
            "limit": limit,
            "offset": offset,
            "results": paginated_results
        }

    def _query_table(
        self,
        conn: sqlite3.Connection,
        obj_type: str,
        query_str: Optional[str],
        filters: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Constructs and executes dynamic SQL query for a specific Teamcenter object type."""
        params = []
        sql = ""
        
        # 1. Base Select queries with JOINs to resolve workflow status
        if obj_type == "Item":
            sql = """
                SELECT i.item_id AS id, i.item_name AS name, i.item_description AS description, 
                       i.createdAt, i.updatedAt, i.createdBy AS owner,
                       COALESCE(w.workflow_status, 'N/A') AS workflow_status
                FROM items i
                LEFT JOIN revisions r ON r.item_id = i.item_id
                LEFT JOIN workflows w ON w.revision_row_id = r.id
                WHERE 1=1
            """
        elif obj_type == "ItemRevision":
            sql = """
                SELECT r.item_id || '/' || r.revision_id AS id, r.revision_id AS name, 
                       'Revision of ' || r.item_id AS description,
                       r.createdAt, r.updatedAt, r.createdBy AS owner,
                       COALESCE(w.workflow_status, 'N/A') AS workflow_status
                FROM revisions r
                LEFT JOIN workflows w ON w.revision_row_id = r.id
                WHERE 1=1
            """
        elif obj_type == "Dataset":
            sql = """
                SELECT d.dataset_id AS id, d.dataset_name AS name, 'Dataset linked to ' || d.item_id AS description,
                       d.createdAt, d.updatedAt, d.createdBy AS owner,
                       COALESCE(w.workflow_status, 'N/A') AS workflow_status
                FROM datasets d
                LEFT JOIN revisions r ON r.item_id = d.item_id
                LEFT JOIN workflows w ON w.revision_row_id = r.id
                WHERE 1=1
            """
        elif obj_type == "Form":
            sql = """
                SELECT f.form_id AS id, f.form_name AS name, f.form_type AS description,
                       f.createdAt, f.updatedAt, f.createdBy AS owner,
                       'N/A' AS workflow_status
                FROM forms f
                WHERE 1=1
            """
        elif obj_type == "Folder":
            sql = """
                SELECT fd.folder_id AS id, fd.folder_name AS name, fd.folder_description AS description,
                       fd.createdAt, fd.updatedAt, fd.createdBy AS owner,
                       'N/A' AS workflow_status
                FROM folders fd
                WHERE 1=1
            """
        elif obj_type == "Workflow":
            sql = """
                SELECT w.workflow_id AS id, w.workflow_name AS name, 'Status: ' || w.workflow_status AS description,
                       w.createdAt, w.updatedAt, w.createdBy AS owner,
                       w.workflow_status AS workflow_status
                FROM workflows w
                WHERE 1=1
            """
        else:
            return []

        # 2. Apply Filters
        alias = {
            "Item": "i",
            "ItemRevision": "r",
            "Dataset": "d",
            "Form": "f",
            "Folder": "fd",
            "Workflow": "w"
        }[obj_type]

        # Owner Filter
        owner_filter = filters.get("owner")
        if owner_filter:
            sql += f" AND {alias}.createdBy = ?"
            params.append(owner_filter.strip())

        # Date Range Filter
        start_date = filters.get("start_date")
        if start_date:
            sql += f" AND {alias}.createdAt >= ?"
            params.append(start_date)
        end_date = filters.get("end_date")
        if end_date:
            sql += f" AND {alias}.createdAt <= ?"
            params.append(end_date)

        # 3. Apply Keyword Search Query
        if query_str and query_str.strip():
            term = f"%{query_str.strip()}%"
            if obj_type == "Item":
                sql += " AND (i.item_id LIKE ? OR i.item_name LIKE ? OR i.item_description LIKE ?)"
                params.extend([term, term, term])
            elif obj_type == "ItemRevision":
                sql += " AND (r.revision_id LIKE ? OR r.item_id LIKE ?)"
                params.extend([term, term])
            elif obj_type == "Dataset":
                sql += " AND (d.dataset_id LIKE ? OR d.dataset_name LIKE ? OR d.item_id LIKE ?)"
                params.extend([term, term, term])
            elif obj_type == "Form":
                sql += " AND (f.form_id LIKE ? OR f.form_name LIKE ? OR f.form_type LIKE ?)"
                params.extend([term, term, term])
            elif obj_type == "Folder":
                sql += " AND (fd.folder_id LIKE ? OR fd.folder_name LIKE ? OR fd.folder_description LIKE ?)"
                params.extend([term, term, term])
            elif obj_type == "Workflow":
                sql += " AND (w.workflow_id LIKE ? OR w.workflow_name LIKE ? OR w.workflow_status LIKE ?)"
                params.extend([term, term, term])

        # Execute query
        cursor = conn.execute(sql, tuple(params))
        rows = cursor.fetchall()
        
        results = []
        for r in rows:
            res_dict = dict(r)
            res_dict["type"] = obj_type
            # Sanitize dates/text
            res_dict["createdAt"] = str(res_dict["createdAt"]).strip()
            res_dict["updatedAt"] = str(res_dict["updatedAt"]).strip()
            results.append(res_dict)
            
        return results
