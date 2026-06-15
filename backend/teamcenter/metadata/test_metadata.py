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

# Setup sys path context to import from teamcenter package correctly
base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if base_dir not in sys.path:
    sys.path.insert(0, base_dir)

from teamcenter.metadata import (
    TeamcenterMetadataService,
    ObjectTypeNotFoundException,
    SearchException,
    router as metadata_router
)

class TestTeamcenterMetadataService(unittest.TestCase):
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

        self.db_conn.commit()

        # Instantiate service and override DB connection
        self.service = TeamcenterMetadataService(db_path=":memory:", cache_ttl_seconds=1)
        self.service._get_db_connection = lambda: self.db_conn

    def tearDown(self):
        self.db_conn.close()

    def test_get_object_types(self):
        types = self.service.get_object_types()
        self.assertEqual(len(types), 6)
        self.assertIn("Item", types)
        self.assertIn("ItemRevision", types)
        self.assertIn("Dataset", types)
        self.assertIn("Form", types)
        self.assertIn("Folder", types)
        self.assertIn("Workflow", types)

    def test_get_relationships(self):
        rels = self.service.get_relationships()
        self.assertTrue(len(rels) >= 3)
        sources = [r["source"] for r in rels]
        self.assertIn("Item", sources)
        self.assertIn("ItemRevision", sources)

    def test_get_dataset_types(self):
        ds_types = self.service.get_dataset_types()
        self.assertIn("PDF", ds_types)
        self.assertIn("DirectModel", ds_types)

    def test_get_workflow_types(self):
        wf_types = self.service.get_workflow_types()
        self.assertIn("Release Process", wf_types)

    def test_get_type_schema_valid(self):
        schema = self.service.get_type_schema("Item")
        self.assertEqual(schema["object_type"], "Item")
        self.assertEqual(schema["table_name"], "items")
        
        # Check properties
        props = {p["name"]: p for p in schema["properties"]}
        self.assertIn("item_id", props)
        self.assertEqual(props["item_id"]["type"], "String")
        self.assertTrue(props["item_id"]["required"]) # Primary Key is NOT NULL / required
        
        self.assertIn("item_description", props)
        self.assertEqual(props["item_description"]["type"], "String")
        self.assertFalse(props["item_description"]["required"]) # Nullable field

    def test_get_type_schema_invalid(self):
        with self.assertRaises(ObjectTypeNotFoundException):
            self.service.get_type_schema("NonExistentType")

    def test_schema_caching_and_ttl(self):
        # Fetch schema once (populates cache)
        schema1 = self.service.get_type_schema("Item")
        cache_key = "schema:Item"
        self.assertIn(cache_key, self.service.cache)

        # Alter table in db (add dummy column)
        self.db_conn.execute("ALTER TABLE items ADD COLUMN test_cache_col INTEGER")
        self.db_conn.commit()

        # Query again (should be cache hit, test_cache_col NOT in schema)
        schema2 = self.service.get_type_schema("Item")
        prop_names = [p["name"] for p in schema2["properties"]]
        self.assertNotIn("test_cache_col", prop_names)

        # Wait for TTL (1s) to expire
        time.sleep(1.2)

        # Query again (should reload schema from DB, test_cache_col present in schema)
        schema3 = self.service.get_type_schema("Item")
        prop_names = [p["name"] for p in schema3["properties"]]
        self.assertIn("test_cache_col", prop_names)

    def test_search_metadata(self):
        # Search for "item"
        res = self.service.search_metadata("item")
        self.assertEqual(res["query"], "item")
        
        # Should match "Item" object type and several properties
        matched_types = [t["object_type"] for t in res["matched_object_types"]]
        self.assertIn("Item", matched_types)
        
        matched_props = [p["property_name"] for p in res["matched_properties"]]
        self.assertIn("item_id", matched_props)

        # Test empty query error
        with self.assertRaises(SearchException):
            self.service.search_metadata("")


class TestMetadataRouter(unittest.TestCase):
    def setUp(self):
        # Setup mock FastAPI application with router
        self.app = FastAPI()
        self.app.include_router(metadata_router)
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
        self.db_path_patcher = patch("teamcenter.metadata.router.get_db_path", return_value=":memory:")
        self.mock_get_db_path = self.db_path_patcher.start()

        # Override verify_api_key's internal connection to use our seeded connection
        self.sqlite_patcher = patch("sqlite3.connect", return_value=self.db_conn)
        self.mock_connect = self.sqlite_patcher.start()

        # Mock metadata service methods to decouple router tests from database schemas
        from teamcenter.metadata.router import metadata_service
        self.patch_types = patch.object(metadata_service, "get_object_types", return_value=["Item"])
        self.patch_schema = patch.object(metadata_service, "get_type_schema", return_value={"object_type": "Item"})
        self.patch_rels = patch.object(metadata_service, "get_relationships", return_value=[{"source": "Item"}])
        self.patch_ds = patch.object(metadata_service, "get_dataset_types", return_value=["PDF"])
        self.patch_wf = patch.object(metadata_service, "get_workflow_types", return_value=["Release Process"])
        self.patch_search = patch.object(metadata_service, "search_metadata", return_value={"query": "item"})

        self.patch_types.start()
        self.patch_schema.start()
        self.patch_rels.start()
        self.patch_ds.start()
        self.patch_wf.start()
        self.patch_search.start()

    def tearDown(self):
        self.patch_search.stop()
        self.patch_wf.stop()
        self.patch_ds.stop()
        self.patch_rels.stop()
        self.patch_schema.stop()
        self.patch_types.stop()
        self.sqlite_patcher.stop()
        self.db_path_patcher.stop()
        self.db_conn.close()

    def test_auth_missing_header(self):
        response = self.client.get("/types")
        self.assertEqual(response.status_code, 401)
        self.assertIn("Missing X-API-Key header", response.json()["detail"])

    def test_auth_invalid_key(self):
        response = self.client.get("/types", headers={"X-API-Key": "invalid_key"})
        self.assertEqual(response.status_code, 401)
        self.assertIn("Invalid API key", response.json()["detail"])

    def test_valid_auth_list_types(self):
        response = self.client.get("/types", headers={"X-API-Key": "valid_test_key"})
        self.assertEqual(response.status_code, 200)
        types = response.json()
        self.assertIn("Item", types)

    def test_get_type_schema_valid_route(self):
        response = self.client.get("/types/Item", headers={"X-API-Key": "valid_test_key"})
        self.assertEqual(response.status_code, 200)
        schema = response.json()
        self.assertEqual(schema["object_type"], "Item")

    def test_get_type_schema_invalid_route(self):
        from teamcenter.metadata.router import metadata_service
        with patch.object(metadata_service, "get_type_schema", side_effect=ObjectTypeNotFoundException("Not found")):
            response = self.client.get("/types/UnknownType", headers={"X-API-Key": "valid_test_key"})
            self.assertEqual(response.status_code, 404)

    def test_list_relationships_route(self):
        response = self.client.get("/relationships", headers={"X-API-Key": "valid_test_key"})
        self.assertEqual(response.status_code, 200)
        rels = response.json()
        self.assertTrue(len(rels) >= 1)

    def test_search_metadata_route(self):
        response = self.client.get("/search?q=item", headers={"X-API-Key": "valid_test_key"})
        self.assertEqual(response.status_code, 200)
        res = response.json()
        self.assertEqual(res["query"], "item")


if __name__ == "__main__":
    unittest.main()
