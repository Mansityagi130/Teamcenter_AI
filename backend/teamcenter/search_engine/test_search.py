import sqlite3
import time
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from fastapi import FastAPI

# Adjust sys path so we can import properly during testing
import sys
import os
from pathlib import Path

base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if base_dir not in sys.path:
    sys.path.insert(0, base_dir)

from teamcenter.search_engine import (
    TeamcenterSearchEngine,
    InvalidSearchFilterException,
    SearchExecutionException,
    router as search_router
)

class TestTeamcenterSearchEngine(unittest.TestCase):
    def setUp(self):
        # Create an in-memory SQLite DB
        self.db_conn = sqlite3.connect(":memory:")
        self.db_conn.row_factory = sqlite3.Row

        # Setup table schemas representing Teamcenter schema
        self.db_conn.execute(
            """
            CREATE TABLE items (
                item_id TEXT PRIMARY KEY,
                item_name TEXT NOT NULL,
                item_description TEXT,
                createdAt TEXT NOT NULL,
                updatedAt TEXT NOT NULL,
                createdBy TEXT
            )
        """
        )
        self.db_conn.execute(
            """
            CREATE TABLE revisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                revision_id TEXT NOT NULL,
                item_id TEXT NOT NULL,
                createdAt TEXT NOT NULL,
                updatedAt TEXT NOT NULL,
                createdBy TEXT
            )
        """
        )
        self.db_conn.execute(
            """
            CREATE TABLE datasets (
                dataset_id TEXT PRIMARY KEY,
                dataset_name TEXT NOT NULL,
                item_id TEXT NOT NULL,
                createdAt TEXT NOT NULL,
                updatedAt TEXT NOT NULL,
                createdBy TEXT
            )
        """
        )
        self.db_conn.execute(
            """
            CREATE TABLE workflows (
                workflow_id TEXT PRIMARY KEY,
                workflow_name TEXT NOT NULL,
                workflow_status TEXT NOT NULL DEFAULT 'Draft',
                revision_row_id INTEGER NOT NULL,
                createdAt TEXT NOT NULL,
                updatedAt TEXT NOT NULL,
                createdBy TEXT
            )
        """
        )
        self.db_conn.execute(
            """
            CREATE TABLE forms (
                form_id TEXT PRIMARY KEY,
                form_name TEXT NOT NULL,
                form_type TEXT NOT NULL,
                createdAt TEXT NOT NULL,
                updatedAt TEXT NOT NULL,
                createdBy TEXT
            )
        """
        )
        self.db_conn.execute(
            """
            CREATE TABLE folders (
                folder_id TEXT PRIMARY KEY,
                folder_name TEXT NOT NULL,
                folder_description TEXT,
                createdAt TEXT NOT NULL,
                updatedAt TEXT NOT NULL,
                createdBy TEXT
            )
        """
        )

        # Seed mock database values
        self.db_conn.execute("INSERT INTO items VALUES ('VALVE_100', 'Control Valve', 'Main control valve', '2026-06-04T12:00:00', '2026-06-04T12:00:00', 'system')")
        self.db_conn.execute("INSERT INTO items VALUES ('VALVE_200', 'Safety Valve', 'Emergency valve', '2026-06-02T12:00:00', '2026-06-02T12:00:00', 'engineer')")
        
        self.db_conn.execute("INSERT INTO revisions (revision_id, item_id, createdAt, updatedAt, createdBy) VALUES ('A', 'VALVE_100', '2026-06-04T12:00:00', '2026-06-04T12:00:00', 'system')")
        self.db_conn.execute("INSERT INTO workflows VALUES ('WF_100', 'Valve Release Workflow', 'Approved', 1, '2026-06-04T12:30:00', '2026-06-04T12:30:00', 'system')")
        
        self.db_conn.commit()

        # Instantiate search engine
        self.engine = TeamcenterSearchEngine(db_path=":memory:")
        self.engine._get_db_connection = lambda: self.db_conn

    def tearDown(self):
        self.db_conn.close()

    def test_search_by_keyword_id_exact(self):
        # Exact ID match weighting
        res = self.engine.search(query="VALVE_100", filters={"type": "Item"})
        self.assertEqual(res["total_results"], 1)
        self.assertEqual(res["results"][0]["id"], "VALVE_100")
        self.assertTrue(res["results"][0]["score"] >= 100.0)

    def test_search_by_keyword_partial(self):
        # Partial ID substring match
        res = self.engine.search(query="VALVE", filters={"type": "Item"})
        self.assertEqual(res["total_results"], 2)
        # Verify scores are assigned
        for item in res["results"]:
            self.assertTrue(item["score"] > 0)

    def test_search_filtering_owner(self):
        res = self.engine.search(filters={"owner": "system"})
        # Should return VALVE_100, revision, and workflow
        ids = [r["id"] for r in res["results"]]
        self.assertIn("VALVE_100", ids)
        self.assertNotIn("VALVE_200", ids) # Owner is engineer

    def test_search_filtering_date_range(self):
        # Date range after VALVE_200 (created 2026-06-02) but including VALVE_100 (created 2026-06-04)
        res = self.engine.search(filters={"start_date": "2026-06-03T00:00:00"})
        ids = [r["id"] for r in res["results"]]
        self.assertIn("VALVE_100", ids)
        self.assertNotIn("VALVE_200", ids)

    def test_search_filtering_workflow_status(self):
        # VALVE_100 revision has workflow status Approved
        res = self.engine.search(filters={"status": "Approved", "type": "Item"})
        self.assertEqual(res["total_results"], 1)
        self.assertEqual(res["results"][0]["id"], "VALVE_100")

    def test_search_sorting(self):
        # Sort by id ASC
        res = self.engine.search(filters={"type": "Item"}, sort_by="id", sort_order="asc")
        self.assertEqual(res["results"][0]["id"], "VALVE_100")
        self.assertEqual(res["results"][1]["id"], "VALVE_200")

        # Sort by id DESC
        res = self.engine.search(filters={"type": "Item"}, sort_by="id", sort_order="desc")
        self.assertEqual(res["results"][0]["id"], "VALVE_200")
        self.assertEqual(res["results"][1]["id"], "VALVE_100")

    def test_search_pagination(self):
        # limit=1, offset=0
        res1 = self.engine.search(filters={"type": "Item"}, sort_by="id", sort_order="asc", limit=1, offset=0)
        self.assertEqual(res1["total_results"], 2)
        self.assertEqual(len(res1["results"]), 1)
        self.assertEqual(res1["results"][0]["id"], "VALVE_100")

        # limit=1, offset=1
        res2 = self.engine.search(filters={"type": "Item"}, sort_by="id", sort_order="asc", limit=1, offset=1)
        self.assertEqual(res2["results"][0]["id"], "VALVE_200")

    def test_invalid_filter_exceptions(self):
        with self.assertRaises(InvalidSearchFilterException):
            self.engine.search(sort_by="invalid_field")

        with self.assertRaises(InvalidSearchFilterException):
            self.engine.search(sort_order="invalid_order")

        with self.assertRaises(InvalidSearchFilterException):
            self.engine.search(filters={"type": "InvalidObjectType"})


class TestSearchRouter(unittest.TestCase):
    def setUp(self):
        # Setup mock FastAPI application with router
        self.app = FastAPI()
        self.app.include_router(search_router)
        self.client = TestClient(self.app)

        # Setup in-memory users db for verifying auth (with check_same_thread=False)
        self.db_conn = sqlite3.connect(":memory:", check_same_thread=False)
        self.db_conn.execute(
            """
            CREATE TABLE users (
                username TEXT PRIMARY KEY,
                api_key TEXT
            )
        """
        )
        self.db_conn.execute("INSERT INTO users VALUES ('test_user', 'valid_test_key')")
        self.db_conn.commit()

        # Patch DB path for router verify_api_key dependency
        self.db_path_patcher = patch("teamcenter.search_engine.router.get_db_path", return_value=":memory:")
        self.mock_get_db_path = self.db_path_patcher.start()

        # Override verify_api_key's internal connection to use our seeded connection
        self.sqlite_patcher = patch("sqlite3.connect", return_value=self.db_conn)
        self.mock_connect = self.sqlite_patcher.start()

        # Mock search service search method to decouple router tests from database schemas
        from teamcenter.search_engine.router import search_engine
        self.patch_search = patch.object(
            search_engine,
            "search",
            return_value={"total_results": 1, "limit": 10, "offset": 0, "results": [{"id": "MOCK_VALVE"}]}
        )
        self.patch_search.start()

    def tearDown(self):
        self.patch_search.stop()
        self.sqlite_patcher.stop()
        self.db_path_patcher.stop()
        self.db_conn.close()

    def test_auth_missing_header(self):
        response = self.client.post("/query", json={"query": "valve"})
        self.assertEqual(response.status_code, 401)
        self.assertIn("Missing X-API-Key header", response.json()["detail"])

    def test_auth_invalid_key(self):
        response = self.client.post("/query", headers={"X-API-Key": "invalid_key"}, json={"query": "valve"})
        self.assertEqual(response.status_code, 401)
        self.assertIn("Invalid API key", response.json()["detail"])

    def test_valid_auth_query_route(self):
        payload = {
            "query": "valve",
            "filters": {
                "type": "Item",
                "owner": "system",
                "status": "Approved"
            },
            "sort_by": "relevance",
            "sort_order": "desc",
            "limit": 10,
            "offset": 0
        }
        response = self.client.post("/query", headers={"X-API-Key": "valid_test_key"}, json=payload)
        self.assertEqual(response.status_code, 200)
        res = response.json()
        self.assertEqual(res["total_results"], 1)
        self.assertEqual(res["results"][0]["id"], "MOCK_VALVE")


if __name__ == "__main__":
    unittest.main()
