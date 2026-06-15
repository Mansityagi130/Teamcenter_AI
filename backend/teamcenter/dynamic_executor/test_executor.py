import sqlite3
import time
import unittest
from unittest.mock import patch, MagicMock
import requests
from fastapi.testclient import TestClient
from fastapi import FastAPI

# Adjust sys path so we can import properly during testing
import sys
import os
from pathlib import Path

base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if base_dir not in sys.path:
    sys.path.insert(0, base_dir)

from teamcenter.dynamic_executor import (
    TeamcenterDynamicExecutor,
    ValidationException,
    ConnectionException,
    ExecutionTimeoutException,
)
from teamcenter.dynamic_executor.router import router as executor_router, raw_router as teamcenter_raw_router

class TestTeamcenterDynamicExecutor(unittest.TestCase):
    def setUp(self):
        self.executor = TeamcenterDynamicExecutor(default_base_url="http://mock-backend")

    @patch("requests.request")
    def test_execute_get_success(self, mock_request):
        # Setup mock response
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {"Content-Type": "application/json"}
        mock_resp.json.return_value = {"status": "ok"}
        mock_resp.ok = True
        mock_request.return_value = mock_resp

        res = self.executor.execute(
            endpoint="/health",
            method="GET",
            headers={"X-API-Key": "test_key"},
            params={"v": "1"}
        )

        self.assertTrue(res["success"])
        self.assertEqual(res["status_code"], 200)
        self.assertEqual(res["payload"], {"status": "ok"})
        self.assertEqual(res["retries_attempted"], 0)
        mock_request.assert_called_once_with(
            method="GET",
            url="http://mock-backend/health",
            headers={"X-API-Key": "test_key"},
            data=None,
            params={"v": "1"},
            timeout=10
        )

    def test_validation_errors(self):
        with self.assertRaises(ValidationException):
            self.executor.execute(endpoint="/health", method="INVALID_METHOD")

        with self.assertRaises(ValidationException):
            self.executor.execute(endpoint="", method="GET")

    @patch("time.sleep")
    @patch("requests.request")
    def test_transient_error_retries_and_failure(self, mock_request, mock_sleep):
        # Returns 503 for all retries
        mock_resp = MagicMock()
        mock_resp.status_code = 503
        mock_resp.headers = {"Content-Type": "text/plain"}
        mock_resp.text = "Service Unavailable"
        mock_resp.ok = False
        mock_request.return_value = mock_resp

        res = self.executor.execute(
            endpoint="/error-route",
            method="POST",
            payload={"data": 1},
            max_retries=2
        )

        # It retried 2 times (attempt 0, 1, 2 = 3 invocations)
        self.assertEqual(mock_request.call_count, 3)
        self.assertEqual(res["status_code"], 503)
        self.assertFalse(res["success"])
        self.assertEqual(res["retries_attempted"], 2)
        
        # Verify exponential backoff sleep intervals (backoff * 2^attempt)
        # Attempt 1: 0.5 * 2 = 1.0s
        # Attempt 2: 0.5 * 4 = 2.0s
        sleep_calls = [call[0][0] for call in mock_sleep.call_args_list]
        self.assertEqual(sleep_calls, [1.0, 2.0])

    @patch("time.sleep")
    @patch("requests.request")
    def test_connection_error_raises_exception(self, mock_request, mock_sleep):
        # Raise connection error
        mock_request.side_effect = requests.exceptions.ConnectionError("Connection refused")

        with self.assertRaises(ConnectionException):
            self.executor.execute(endpoint="/fail-route", method="GET", max_retries=1)

        self.assertEqual(mock_request.call_count, 2)

    @patch("time.sleep")
    @patch("requests.request")
    def test_timeout_raises_exception(self, mock_request, mock_sleep):
        # Raise timeout error
        mock_request.side_effect = requests.exceptions.Timeout("Timeout occurred")

        with self.assertRaises(ExecutionTimeoutException):
            self.executor.execute(endpoint="/timeout-route", method="GET", max_retries=1)

        self.assertEqual(mock_request.call_count, 2)


class TestExecutorRouter(unittest.TestCase):
    def setUp(self):
        # Setup mock FastAPI application with router
        self.app = FastAPI()
        self.app.include_router(executor_router)
        self.app.include_router(teamcenter_raw_router)
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
        self.db_path_patcher = patch("teamcenter.dynamic_executor.router.get_db_path", return_value=":memory:")
        self.mock_get_db_path = self.db_path_patcher.start()

        # Override verify_api_key's internal connection to use our seeded connection
        self.sqlite_patcher = patch("sqlite3.connect", return_value=self.db_conn)
        self.mock_connect = self.sqlite_patcher.start()

        # Mock executor service methods to decouple router tests from target HTTP servers
        from teamcenter.dynamic_executor.router import executor_service
        self.patch_execute = patch.object(
            executor_service,
            "execute",
            return_value={"status_code": 200, "payload": "OK", "success": True, "elapsed_ms": 1.0, "retries_attempted": 0}
        )
        self.patch_execute.start()

    def tearDown(self):
        self.patch_execute.stop()
        self.sqlite_patcher.stop()
        self.db_path_patcher.stop()
        self.db_conn.close()

    def test_auth_missing_header(self):
        response = self.client.post("/execute", json={"endpoint": "/test", "method": "GET"})
        self.assertEqual(response.status_code, 401)

    def test_auth_invalid_key(self):
        response = self.client.post("/execute", headers={"X-API-Key": "invalid_key"}, json={"endpoint": "/test", "method": "GET"})
        self.assertEqual(response.status_code, 401)

    def test_valid_execute_route(self):
        payload = {
            "endpoint": "/test-route",
            "method": "POST",
            "headers": {"custom-header": "val"},
            "payload": {"data": True},
            "params": {"verbose": "1"},
            "timeout": 5,
            "max_retries": 2
        }
        response = self.client.post("/execute", headers={"X-API-Key": "valid_test_key"}, json=payload)
        self.assertEqual(response.status_code, 200)
        res = response.json()
        self.assertTrue(res["success"])
        self.assertEqual(res["payload"], "OK")

    def test_valid_raw_route_with_service_operation(self):
        payload = {
            "service_name": "item",
            "operation_name": "search",
            "method": "POST",
            "payload": {"item_id": "123"},
            "headers": {"custom-header": "val"},
            "params": {"verbose": "1"},
            "timeout": 5,
            "max_retries": 2
        }
        response = self.client.post("/raw", headers={"X-API-Key": "valid_test_key"}, json=payload)
        self.assertEqual(response.status_code, 200)
        res = response.json()
        self.assertTrue(res["success"])
        self.assertEqual(res["payload"], "OK")


if __name__ == "__main__":
    unittest.main()
