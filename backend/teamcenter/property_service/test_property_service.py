from datetime import datetime
import sqlite3
import time
import unittest
from teamcenter.property_service import (
    TeamcenterPropertyService,
    InvalidObjectTypeException,
    ObjectNotFoundException,
    PropertyNotFoundException,
)


class TestTeamcenterPropertyService(unittest.TestCase):
    def setUp(self):
        # Setup an in-memory SQLite database representing Teamcenter db schema
        self.db_conn = sqlite3.connect(":memory:")
        self.db_conn.row_factory = sqlite3.Row

        # Create schema
        self.db_conn.execute(
            """
            CREATE TABLE items (
                item_id TEXT PRIMARY KEY,
                item_name TEXT,
                item_description TEXT,
                createdAt TEXT,
                updatedAt TEXT,
                createdBy TEXT
            )
        """
        )
        self.db_conn.execute(
            """
            CREATE TABLE revisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                revision_id TEXT,
                item_id TEXT,
                createdAt TEXT,
                updatedAt TEXT,
                createdBy TEXT
            )
        """
        )
        self.db_conn.execute(
            """
            CREATE TABLE datasets (
                dataset_id TEXT PRIMARY KEY,
                dataset_name TEXT,
                item_id TEXT,
                createdAt TEXT,
                updatedAt TEXT,
                createdBy TEXT
            )
        """
        )
        self.db_conn.execute(
            """
            CREATE TABLE forms (
                form_id TEXT PRIMARY KEY,
                form_name TEXT,
                form_type TEXT,
                createdAt TEXT,
                updatedAt TEXT,
                createdBy TEXT
            )
        """
        )
        self.db_conn.execute(
            """
            CREATE TABLE workflows (
                workflow_id TEXT PRIMARY KEY,
                workflow_name TEXT,
                workflow_status TEXT,
                revision_row_id INTEGER,
                createdAt TEXT,
                updatedAt TEXT,
                createdBy TEXT
            )
        """
        )
        self.db_conn.execute(
            """
            CREATE TABLE folders (
                folder_id TEXT PRIMARY KEY,
                folder_name TEXT,
                folder_description TEXT,
                createdAt TEXT,
                updatedAt TEXT,
                createdBy TEXT
            )
        """
        )

        # Seed mock data
        self.db_conn.execute(
            "INSERT INTO items VALUES ('VALVE_100', 'Control Valve', 'Main control valve', '2026-06-04', '2026-06-04', 'system')"
        )
        self.db_conn.execute(
            "INSERT INTO revisions (revision_id, item_id, createdAt, updatedAt, createdBy) VALUES ('A', 'VALVE_100', '2026-06-04', '2026-06-04', 'system')"
        )
        self.db_conn.execute(
            "INSERT INTO forms VALUES ('FORM_001', 'Form Spec', 'Specification Form', '2026-06-04', '2026-06-04', 'system')"
        )
        self.db_conn.commit()

        # Initialize service and override connection helper to return the in-memory connection
        self.service = TeamcenterPropertyService(
            db_path=":memory:", cache_ttl_seconds=1
        )
        self.service._get_db_connection = lambda: self.db_conn

    def tearDown(self):
        self.db_conn.close()

    def test_get_property_valid(self):
        # Query single property
        val = self.service.get_property("Item", "VALVE_100", "item_name")
        self.assertEqual(val, "Control Valve")

        # Query Form property
        form_name = self.service.get_property("Form", "FORM_001", "form_name")
        self.assertEqual(form_name, "Form Spec")

    def test_get_properties_multiple(self):
        # Query multiple properties
        props = self.service.get_properties(
            "Item", "VALVE_100", ["item_name", "item_description", "createdBy"]
        )
        self.assertEqual(
            props,
            {
                "item_name": "Control Valve",
                "item_description": "Main control valve",
                "createdBy": "system",
            },
        )

    def test_get_all_properties(self):
        # Query all properties
        all_props = self.service.get_all_properties("Item", "VALVE_100")
        self.assertIn("item_id", all_props)
        self.assertEqual(all_props["item_name"], "Control Valve")
        self.assertEqual(all_props["item_description"], "Main control valve")

    def test_invalid_object_type(self):
        with self.assertRaises(InvalidObjectTypeException):
            self.service.get_property(
                "InvalidType", "VALVE_100", "item_name"
            )

    def test_property_not_found(self):
        with self.assertRaises(PropertyNotFoundException):
            self.service.get_property(
                "Item", "VALVE_100", "non_existent_property"
            )

    def test_object_not_found(self):
        with self.assertRaises(ObjectNotFoundException):
            self.service.get_property("Item", "UNKNOWN_ID", "item_name")

    def test_caching_behavior_and_ttl(self):
        # Fetching property should cache the object
        self.assertEqual(
            self.service.get_property("Item", "VALVE_100", "item_name"),
            "Control Valve",
        )
        cache_key = ("Item", "VALVE_100")
        self.assertIn(cache_key, self.service.cache)

        # Update database value directly
        self.db_conn.execute(
            "UPDATE items SET item_name = 'Updated Valve' WHERE item_id = 'VALVE_100'"
        )
        self.db_conn.commit()

        # Fetching again should return cached (old) value (cache hit!)
        self.assertEqual(
            self.service.get_property("Item", "VALVE_100", "item_name"),
            "Control Valve",
        )

        # Wait for TTL to expire
        time.sleep(1.2)

        # Fetching again should fetch updated value (cache miss!)
        self.assertEqual(
            self.service.get_property("Item", "VALVE_100", "item_name"),
            "Updated Valve",
        )

    def test_compound_item_revision_query(self):
        # Query revision using compound id 'item_id/revision_id'
        val = self.service.get_property(
            "ItemRevision", "VALVE_100/A", "revision_id"
        )
        self.assertEqual(val, "A")


if __name__ == "__main__":
    unittest.main()
