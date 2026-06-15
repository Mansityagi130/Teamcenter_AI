import sqlite3
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

from teamcenter.api_catalog import (
    TeamcenterApiCatalog,
    CatalogException,
    EndpointNotFoundException,
    router as catalog_router
)

class TestTeamcenterApiCatalog(unittest.TestCase):
    def setUp(self):
        # Create an in-memory SQLite DB representing activity logs
        self.db_conn = sqlite3.connect(":memory:")
        self.db_conn.row_factory = sqlite3.Row

        self.db_conn.execute(
            """
            CREATE TABLE activity_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                endpoint TEXT,
                action TEXT,
                timestamp TEXT
            )
        """
        )
        self.db_conn.commit()

        # Seed metrics logs
        self.db_conn.execute("INSERT INTO activity_logs (user_id, endpoint, action, timestamp) VALUES ('user1', '/item/search', 'search_call', '2026-06-04T12:00:00Z')")
        self.db_conn.execute("INSERT INTO activity_logs (user_id, endpoint, action, timestamp) VALUES ('user2', '/item/search', 'search_call', '2026-06-04T12:30:00Z')")
        self.db_conn.execute("INSERT INTO activity_logs (user_id, endpoint, action, timestamp) VALUES ('user1', '/item/search', 'search_call', '2026-06-04T13:00:00Z')")
        self.db_conn.execute("INSERT INTO activity_logs (user_id, endpoint, action, timestamp) VALUES ('user1', '/dataset/add', 'add_call', '2026-06-04T12:15:00Z')")
        self.db_conn.commit()

        # Instantiate service
        self.catalog = TeamcenterApiCatalog(db_path=":memory:")
        self.catalog._get_db_connection = lambda: self.db_conn

    def tearDown(self):
        self.db_conn.close()

    def test_get_catalog_all(self):
        cat = self.catalog.get_catalog()
        # Verify it lists several predefined endpoints
        self.assertTrue(len(cat) > 10)
        # Verify schema keys
        self.assertIn("endpoint", cat[0])
        self.assertIn("category", cat[0])

    def test_get_catalog_filtered_and_searched(self):
        # Filter by Category
        items_cat = self.catalog.get_catalog(category="Items")
        categories = {e["category"] for e in items_cat}
        self.assertEqual(categories, {"Items"})

        # Search by Query
        search_cat = self.catalog.get_catalog(q="BOM")
        for entry in search_cat:
            matched = ("bom" in entry["endpoint"].lower() or 
                       "bom" in entry["category"].lower() or 
                       "bom" in entry["description"].lower())
            self.assertTrue(matched)

    def test_get_api_metadata_valid(self):
        meta = self.catalog.get_api_metadata(method="POST", endpoint="/item/search")
        self.assertEqual(meta["category"], "Items")
        self.assertIn("query", meta["parameters"])

    def test_get_api_metadata_invalid(self):
        with self.assertRaises(EndpointNotFoundException):
            self.catalog.get_api_metadata(method="GET", endpoint="/item/invalid-path")

    def test_get_usage_statistics(self):
        stats = self.catalog.get_usage_statistics(method="POST", endpoint="/item/search")
        self.assertEqual(stats["invocation_count"], 3)
        self.assertEqual(stats["unique_users_count"], 2)
        self.assertEqual(stats["last_invoked_at"], "2026-06-04T13:00:00Z")

    def test_get_all_usage_statistics(self):
        all_stats = self.catalog.get_all_usage_statistics()
        self.assertIn("/item/search", all_stats)
        self.assertEqual(all_stats["/item/search"]["invocation_count"], 3)
        self.assertEqual(all_stats["/dataset/add"]["invocation_count"], 1)
        self.assertEqual(all_stats["/item/add"]["invocation_count"], 0)


class TestCatalogRouter(unittest.TestCase):
    def setUp(self):
        # Setup mock FastAPI application with router
        self.app = FastAPI()
        self.app.include_router(catalog_router)
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
        self.db_path_patcher = patch("teamcenter.api_catalog.router.get_db_path", return_value=":memory:")
        self.mock_get_db_path = self.db_path_patcher.start()

        # Override verify_api_key's internal connection to use our seeded connection
        self.sqlite_patcher = patch("sqlite3.connect", return_value=self.db_conn)
        self.mock_connect = self.sqlite_patcher.start()

        # Mock catalog service methods to decouple router tests from database schemas
        from teamcenter.api_catalog.router import api_catalog
        self.patch_list = patch.object(
            api_catalog,
            "get_catalog",
            return_value=[{"method": "POST", "endpoint": "/item/search", "category": "Items"}]
        )
        self.patch_meta = patch.object(
            api_catalog,
            "get_api_metadata",
            return_value={"method": "POST", "endpoint": "/item/search", "parameters": {}}
        )
        self.patch_stats = patch.object(
            api_catalog,
            "get_usage_statistics",
            return_value={"endpoint": "/item/search", "invocation_count": 5}
        )
        self.patch_all_stats = patch.object(
            api_catalog,
            "get_all_usage_statistics",
            return_value={"/item/search": {"invocation_count": 5}}
        )

        self.patch_list.start()
        self.patch_meta.start()
        self.patch_stats.start()
        self.patch_all_stats.start()

    def tearDown(self):
        self.patch_all_stats.stop()
        self.patch_stats.stop()
        self.patch_meta.stop()
        self.patch_list.stop()
        self.sqlite_patcher.stop()
        self.db_path_patcher.stop()
        self.db_conn.close()

    def test_auth_missing_header(self):
        response = self.client.get("/api/catalog")
        self.assertEqual(response.status_code, 401)

    def test_auth_invalid_key(self):
        response = self.client.get("/api/catalog", headers={"X-API-Key": "invalid_key"})
        self.assertEqual(response.status_code, 401)

    def test_valid_list_route(self):
        response = self.client.get("/api/catalog", headers={"X-API-Key": "valid_test_key"})
        self.assertEqual(response.status_code, 200)
        res = response.json()
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["endpoint"], "/item/search")

    def test_metadata_route(self):
        response = self.client.get("/api/catalog/metadata?method=POST&endpoint=/item/search", headers={"X-API-Key": "valid_test_key"})
        self.assertEqual(response.status_code, 200)
        res = response.json()
        self.assertEqual(res["endpoint"], "/item/search")

    def test_metadata_route_invalid(self):
        from teamcenter.api_catalog.router import api_catalog
        with patch.object(api_catalog, "get_api_metadata", side_effect=EndpointNotFoundException("Not found")):
            response = self.client.get("/api/catalog/metadata?method=POST&endpoint=/item/invalid", headers={"X-API-Key": "valid_test_key"})
            self.assertEqual(response.status_code, 404)

    def test_statistics_route(self):
        response = self.client.get("/api/catalog/statistics?method=POST&endpoint=/item/search", headers={"X-API-Key": "valid_test_key"})
        self.assertEqual(response.status_code, 200)
        res = response.json()
        self.assertEqual(res["invocation_count"], 5)

    def test_all_statistics_route(self):
        response = self.client.get("/api/catalog/statistics/all", headers={"X-API-Key": "valid_test_key"})
        self.assertEqual(response.status_code, 200)
        res = response.json()
        self.assertEqual(res["/item/search"]["invocation_count"], 5)


if __name__ == "__main__":
    unittest.main()
