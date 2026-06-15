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

from teamcenter.health import (
    TeamcenterHealthService,
    HealthMonitoringException,
    DiagnosticsFailureException,
    router as health_router
)

class TestTeamcenterHealthService(unittest.TestCase):
    def setUp(self):
        # Create an in-memory SQLite DB
        self.db_conn = sqlite3.connect(":memory:")
        self.db_conn.row_factory = sqlite3.Row

        # Setup standard users & settings tables for tests
        self.db_conn.execute(
            """
            CREATE TABLE users (
                username TEXT PRIMARY KEY,
                api_key TEXT
            )
        """
        )
        self.db_conn.execute(
            """
            CREATE TABLE user_settings (
                user_id TEXT PRIMARY KEY,
                tc_user TEXT
            )
        """
        )
        self.db_conn.execute(
            """
            CREATE TABLE chat_sessions (
                session_id TEXT PRIMARY KEY
            )
        """
        )
        self.db_conn.commit()

        # Seed data
        self.db_conn.execute("INSERT INTO users VALUES ('test_admin', 'some_api_key')")
        self.db_conn.execute("INSERT INTO user_settings VALUES ('system', 'tc_admin_prod')")
        self.db_conn.execute("INSERT INTO chat_sessions VALUES ('session_1')")
        self.db_conn.commit()

        # Instantiate health service
        self.service = TeamcenterHealthService(db_path=":memory:")
        self.service._get_db_connection = lambda: self.db_conn

    def tearDown(self):
        self.db_conn.close()

    def test_record_metric(self):
        self.service.record_metric("/item/add", 15.5, "success")
        self.service.record_metric("/item/delete", 40.2, "error")

        with self.service.metrics_lock:
            history = list(self.service.metrics_history)

        self.assertEqual(len(history), 2)
        self.assertEqual(history[0]["operation"], "/item/add")
        self.assertEqual(history[0]["latency_ms"], 15.5)
        self.assertEqual(history[0]["status"], "success")

        self.assertEqual(history[1]["operation"], "/item/delete")
        self.assertEqual(history[1]["latency_ms"], 40.2)
        self.assertEqual(history[1]["status"], "error")

    def test_check_db_health(self):
        # Healthy DB
        self.assertTrue(self.service.check_db_health())

        # Unhealthy DB (closed connection)
        self.db_conn.close()
        self.assertFalse(self.service.check_db_health())

    def test_get_status_up(self):
        status = self.service.get_status()
        self.assertEqual(status["status"], "UP")
        self.assertEqual(status["subsystems"]["database"], "UP")

    def test_get_status_down(self):
        self.db_conn.close()
        status = self.service.get_status()
        self.assertEqual(status["status"], "DOWN")
        self.assertEqual(status["subsystems"]["database"], "DOWN")

    def test_get_detailed_health_calculations(self):
        # Record dummy latencies: 10, 20, 30. Errors: 1 out of 3 (33.33%)
        self.service.record_metric("op1", 10.0, "success")
        self.service.record_metric("op2", 20.0, "success")
        self.service.record_metric("op3", 30.0, "error")

        report = self.service.get_detailed_health()
        metrics = report["metrics"]
        
        # Verify status
        self.assertEqual(report["status"], "UP")
        
        # Verify authentication health
        self.assertTrue(metrics["authentication_health"]["api_key_configured"])
        self.assertTrue(metrics["authentication_health"]["tc_admin_configured"])

        # Verify session count
        self.assertEqual(metrics["session_health"]["active_sessions"], 1)

        # Verify latency calculations
        self.assertEqual(metrics["response_times"]["min_ms"], 10.0)
        self.assertEqual(metrics["response_times"]["max_ms"], 30.0)
        self.assertEqual(metrics["response_times"]["average_ms"], 20.0)

        # Verify error calculations
        self.assertEqual(metrics["error_rates"]["total_requests"], 3)
        self.assertEqual(metrics["error_rates"]["error_requests"], 1)
        self.assertEqual(metrics["error_rates"]["error_percentage"], 33.33)

    def test_get_detailed_health_degraded_and_down(self):
        # Test Degraded (No API keys or settings configured)
        self.db_conn.execute("DELETE FROM users")
        self.db_conn.commit()

        report = self.service.get_detailed_health()
        self.assertEqual(report["status"], "DEGRADED")
        self.assertFalse(report["metrics"]["authentication_health"]["api_key_configured"])
        self.assertTrue(len(report["diagnostics"]["troubleshooting_steps"]) > 0)

        # Test Down
        self.db_conn.close()
        report = self.service.get_detailed_health()
        self.assertEqual(report["status"], "DOWN")
        self.assertEqual(report["metrics"]["api_availability"]["status"], "DOWN")


class TestHealthRouter(unittest.TestCase):
    def setUp(self):
        # Setup mock FastAPI application with router
        self.app = FastAPI()
        self.app.include_router(health_router)
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
        self.db_path_patcher = patch("teamcenter.health.router.get_db_path", return_value=":memory:")
        self.mock_get_db_path = self.db_path_patcher.start()

        # Override verify_api_key's internal connection to use our seeded connection
        self.sqlite_patcher = patch("sqlite3.connect", return_value=self.db_conn)
        self.mock_connect = self.sqlite_patcher.start()

        # Mock health service methods to decouple router tests from database schemas
        from teamcenter.health.router import health_service
        self.patch_status = patch.object(
            health_service,
            "get_status",
            return_value={"status": "UP", "subsystems": {"database": "UP"}}
        )
        self.patch_detailed = patch.object(
            health_service,
            "get_detailed_health",
            return_value={"status": "UP", "metrics": {"response_times": {"min_ms": 1.0}}}
        )
        self.patch_status.start()
        self.patch_detailed.start()

    def tearDown(self):
        self.patch_detailed.stop()
        self.patch_status.stop()
        self.sqlite_patcher.stop()
        self.db_path_patcher.stop()
        self.db_conn.close()

    def test_tc_ping_route(self):
        response = self.client.get("/teamcenter/ping")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_tc_status_route(self):
        response = self.client.get("/teamcenter/status")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "UP")

    def test_tc_health_route_auth_missing(self):
        response = self.client.get("/teamcenter/health")
        self.assertEqual(response.status_code, 401)

    def test_tc_health_route_auth_invalid(self):
        response = self.client.get("/teamcenter/health", headers={"X-API-Key": "invalid_key"})
        self.assertEqual(response.status_code, 401)

    def test_tc_health_route_auth_valid(self):
        response = self.client.get("/teamcenter/health", headers={"X-API-Key": "valid_test_key"})
        self.assertEqual(response.status_code, 200)
        res = response.json()
        self.assertEqual(res["status"], "UP")


if __name__ == "__main__":
    unittest.main()
