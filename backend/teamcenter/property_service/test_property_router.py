import os
import sys
import sqlite3
import unittest
from unittest.mock import patch, MagicMock
from fastapi import FastAPI
from fastapi.testclient import TestClient

# Adjust sys path so we can import properly during testing
base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if base_dir not in sys.path:
    sys.path.insert(0, base_dir)

from teamcenter.property_service import (
    router as property_router,
    InvalidObjectTypeException,
    ObjectNotFoundException,
    PropertyNotFoundException,
)


class TestPropertyRouter(unittest.TestCase):
    def setUp(self):
        # Create FastAPI application and include router
        self.app = FastAPI()
        self.app.include_router(property_router)
        self.client = TestClient(self.app)

        # Setup an in-memory SQLite DB for verifying auth
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

        # Patch the database path and SQLite connections in verify_api_key
        self.db_path_patcher = patch(
            "teamcenter.property_service.router.get_db_path", return_value=":memory:"
        )
        self.mock_get_db_path = self.db_path_patcher.start()

        self.sqlite_patcher = patch("sqlite3.connect", return_value=self.db_conn)
        self.mock_connect = self.sqlite_patcher.start()

        # Mock the service methods to isolate router tests
        from teamcenter.property_service.router import property_service

        self.patch_get_prop = patch.object(
            property_service, "get_property", return_value="Valve Assembly"
        )
        self.patch_get_props = patch.object(
            property_service,
            "get_properties",
            return_value={"item_name": "Valve Assembly", "createdBy": "system"},
        )
        self.patch_get_all = patch.object(
            property_service,
            "get_all_properties",
            return_value={
                "item_id": "VALVE_100",
                "item_name": "Valve Assembly",
                "createdBy": "system",
            },
        )

        self.mock_get_prop = self.patch_get_prop.start()
        self.mock_get_props = self.patch_get_props.start()
        self.mock_get_all = self.patch_get_all.start()

    def tearDown(self):
        self.patch_get_all.stop()
        self.patch_get_props.stop()
        self.patch_get_prop.stop()
        self.sqlite_patcher.stop()
        self.db_path_patcher.stop()
        self.db_conn.close()

    def test_auth_missing_header(self):
        response = self.client.get("/api/properties/property")
        self.assertEqual(response.status_code, 401)

    def test_auth_invalid_key(self):
        response = self.client.get(
            "/api/properties/property", headers={"X-API-Key": "invalid_key"}
        )
        self.assertEqual(response.status_code, 401)

    def test_get_single_property_success(self):
        response = self.client.get(
            "/api/properties/property?object_type=Item&object_id=VALVE_100&property_name=item_name",
            headers={"X-API-Key": "valid_test_key"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(), {"property_name": "item_name", "value": "Valve Assembly"}
        )
        self.mock_get_prop.assert_called_once_with("Item", "VALVE_100", "item_name")

    def test_get_single_property_not_found(self):
        self.mock_get_prop.side_effect = ObjectNotFoundException("Object not found")
        response = self.client.get(
            "/api/properties/property?object_type=Item&object_id=INVALID&property_name=item_name",
            headers={"X-API-Key": "valid_test_key"},
        )
        self.assertEqual(response.status_code, 404)

    def test_get_single_property_invalid_prop(self):
        self.mock_get_prop.side_effect = PropertyNotFoundException("Property not found")
        response = self.client.get(
            "/api/properties/property?object_type=Item&object_id=VALVE_100&property_name=invalid_prop",
            headers={"X-API-Key": "valid_test_key"},
        )
        self.assertEqual(response.status_code, 404)

    def test_get_batch_properties_success(self):
        payload = {
            "object_type": "Item",
            "object_id": "VALVE_100",
            "properties": ["item_name", "createdBy"],
        }
        response = self.client.post(
            "/api/properties/batch",
            json=payload,
            headers={"X-API-Key": "valid_test_key"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(), {"item_name": "Valve Assembly", "createdBy": "system"}
        )
        self.mock_get_props.assert_called_once_with(
            "Item", "VALVE_100", ["item_name", "createdBy"]
        )

    def test_get_all_properties_success(self):
        response = self.client.get(
            "/api/properties/all?object_type=Item&object_id=VALVE_100",
            headers={"X-API-Key": "valid_test_key"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "item_id": "VALVE_100",
                "item_name": "Valve Assembly",
                "createdBy": "system",
            },
        )
        self.mock_get_all.assert_called_once_with("Item", "VALVE_100")


if __name__ == "__main__":
    unittest.main()
