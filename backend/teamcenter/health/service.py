import os
import sqlite3
import time
import logging
from collections import deque
from threading import Lock
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
from services.database import get_database_path

logger = logging.getLogger("teamcenter.health_monitoring")


class TeamcenterHealthService:
    """Thread-safe monitoring service capturing latencies, error states, and diagnostics."""

    def __init__(self, db_path: Optional[str] = None, max_metrics_history: int = 1000):
        if db_path is None:
            db_path = str(get_database_path())
        self.db_path = db_path
        self.max_metrics_history = max_metrics_history
        
        # Thread-safe in-memory sliding window for operation metrics
        self.metrics_lock = Lock()
        self.metrics_history = deque(maxlen=max_metrics_history)

    def _get_db_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def record_metric(self, operation: str, latency_ms: float, status: str) -> None:
        """Saves a metric record of an operation latency and status outcome (success/error)."""
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "operation": operation,
            "latency_ms": float(latency_ms),
            "status": "success" if str(status).lower() in ("success", "ok") else "error"
        }
        with self.metrics_lock:
            self.metrics_history.append(record)
        logger.info(f"action=record_metric operation={operation} latency_ms={latency_ms:.2f} status={status}")

    def check_db_health(self) -> bool:
        """Verifies read connection to the SQLite database."""
        try:
            with self._get_db_connection() as conn:
                conn.execute("SELECT 1 FROM users LIMIT 1").fetchone()
            return True
        except Exception as e:
            logger.error(f"action=check_db_health status=error error={str(e)}")
            return False

    def get_status(self) -> Dict[str, Any]:
        """Provides quick subsystem status statuses."""
        db_up = self.check_db_health()
        
        # Subsystems quick checks
        db_status = "UP" if db_up else "DOWN"
        session_manager_status = "UP" if db_up else "DEGRADED"
        api_wrapper_status = "UP" if db_up else "DOWN"
        
        overall_status = "UP"
        if not db_up:
            overall_status = "DOWN"

        return {
            "status": overall_status,
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "subsystems": {
                "database": db_status,
                "session_manager": session_manager_status,
                "api_wrapper": api_wrapper_status
            }
        }

    def get_detailed_health(self) -> Dict[str, Any]:
        """Assembles detailed diagnostics, response-times, error-rates, and configuration health."""
        db_up = self.check_db_health()
        
        # 1. Configuration / Auth Health
        api_key_configured = False
        tc_admin_configured = False
        auth_status = "DOWN"
        
        if db_up:
            try:
                with self._get_db_connection() as conn:
                    # Check active API keys
                    row = conn.execute("SELECT 1 FROM users WHERE api_key IS NOT NULL LIMIT 1").fetchone()
                    api_key_configured = bool(row)
                    
                    # Check settings
                    row_set = conn.execute("SELECT tc_user FROM user_settings WHERE user_id = 'system'").fetchone()
                    if row_set and row_set["tc_user"]:
                        tc_admin_configured = True
                auth_status = "UP" if (api_key_configured and tc_admin_configured) else "DEGRADED"
            except Exception:
                auth_status = "DOWN"

        # 2. Session Health
        active_sessions = 0
        expired_sessions = 0
        if db_up:
            try:
                with self._get_db_connection() as conn:
                    active_sessions = conn.execute("SELECT COUNT(*) FROM chat_sessions").fetchone()[0]
            except Exception:
                pass

        # 3. Latency & Error Stats (using memory buffer)
        with self.metrics_lock:
            metrics_list = list(self.metrics_history)

        total_requests = len(metrics_list)
        error_requests = sum(1 for m in metrics_list if m["status"] == "error")
        error_percentage = (error_requests / total_requests * 100.0) if total_requests > 0 else 0.0

        if total_requests > 0:
            latencies = [m["latency_ms"] for m in metrics_list]
            min_ms = min(latencies)
            max_ms = max(latencies)
            avg_ms = sum(latencies) / total_requests
        else:
            # Query activity_logs for baseline stats if memory metrics are empty
            min_ms = 0.0
            max_ms = 0.0
            avg_ms = 0.0
            if db_up:
                try:
                    with self._get_db_connection() as conn:
                        total_requests = conn.execute("SELECT COUNT(*) FROM activity_logs").fetchone()[0]
                        # Mock error count based on failed actions
                        error_requests = conn.execute("SELECT COUNT(*) FROM activity_logs WHERE action LIKE '%fail%'").fetchone()[0]
                        error_percentage = (error_requests / total_requests * 100.0) if total_requests > 0 else 0.0
                except Exception:
                    pass

        # 4. Diagnostics & Troubleshooting Advice
        troubleshooting_steps = []
        overall_status = "UP"

        if not db_up:
            overall_status = "DOWN"
            troubleshooting_steps.append("SQLite database connection failed. Verify 'teamcenter.db' read-write permissions and system path settings.")
        
        if auth_status == "DEGRADED":
            if overall_status == "UP":
                overall_status = "DEGRADED"
            troubleshooting_steps.append("Authentication is degraded: Ensure api_key values and tc_user configs are configured in SQLite users and user_settings tables.")

        diagnostics = {
            "message": "All subsystems are running optimally." if overall_status == "UP" else "Subsystems warnings detected.",
            "troubleshooting_steps": troubleshooting_steps
        }

        # 5. API wrapper availability simulation
        api_wrapper_latency_ms = 0.0
        if db_up:
            t0 = time.time()
            self.check_db_health()  # Lightweight check
            api_wrapper_latency_ms = (time.time() - t0) * 1000.0

        return {
            "status": overall_status,
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "metrics": {
                "authentication_health": {
                    "status": auth_status,
                    "api_key_configured": api_key_configured,
                    "tc_admin_configured": tc_admin_configured
                },
                "session_health": {
                    "active_sessions": active_sessions,
                    "expired_sessions": expired_sessions
                },
                "api_availability": {
                    "status": "UP" if db_up else "DOWN",
                    "latency_ms": round(api_wrapper_latency_ms, 2)
                },
                "response_times": {
                    "min_ms": round(min_ms, 2),
                    "max_ms": round(max_ms, 2),
                    "average_ms": round(avg_ms, 2)
                },
                "error_rates": {
                    "total_requests": total_requests,
                    "error_requests": error_requests,
                    "error_percentage": round(error_percentage, 2)
                }
            },
            "diagnostics": diagnostics,
            "historical_metrics": metrics_list
        }
