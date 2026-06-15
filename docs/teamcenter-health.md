# Teamcenter Health Monitoring

The Teamcenter Health Monitoring module is a standalone monitoring subsystem designed to track connection status, session states, response latencies, and error rates of Teamcenter operations, exposing status endpoints for administrators and monitoring systems.

---

## 1. System Architecture

The health monitoring system aggregates metric logs in memory and runs dynamic checks against subsystems (SQLite DB, Session Manager, and API wrapper) when requested:

```text
        +--------------------------------------------+
        |             Monitoring System              |
        +--------------------------------------------+
                              │
                              ▼
        +--------------------------------------------+
        |            FastAPI /teamcenter/*           |
        +--------------------------------------------+
                              │
                              ▼
        +--------------------------------------------+
        |          TeamcenterHealthService           |
        |  ┌──────────────────┐  ┌────────────────┐  |
        |  │ Metrics Registry │  │ Subsystem Ping │  |
        |  └──────────────────┘  └────────────────┘  |
        +--------------------------------------------+
            │                  │                  │
            ▼                  ▼                  ▼
  +------------------+  +--------------+  +------------------+
  | SQLite Database  |  |   Session    |  |    TC Wrapper    |
  |  Connection      |  |   Manager    |  |    Availability  |
  +------------------+  +--------------+  +------------------+
```

---

## 2. API Endpoints

### Low Overhead Ping
- **URL**: `GET /teamcenter/ping`
- **Authentication**: None required.
- **Response**:
  ```json
  {
    "status": "ok",
    "timestamp": "2026-06-04T15:17:23Z"
  }
  ```

### Subsystems Status
- **URL**: `GET /teamcenter/status`
- **Authentication**: None required.
- **Response**:
  ```json
  {
    "status": "UP",
    "timestamp": "2026-06-04T15:17:23Z",
    "subsystems": {
      "database": "UP",
      "session_manager": "UP",
      "api_wrapper": "UP"
    }
  }
  ```

### Detailed Health Report
- **URL**: `GET /teamcenter/health`
- **Authentication**: Requires a valid `X-API-Key` header.
- **Response**:
  ```json
  {
    "status": "UP",
    "timestamp": "2026-06-04T15:17:23Z",
    "metrics": {
      "authentication_health": {
        "status": "UP",
        "api_key_configured": true,
        "tc_admin_configured": true
      },
      "session_health": {
        "active_sessions": 2,
        "expired_sessions": 0
      },
      "api_availability": {
        "status": "UP",
        "latency_ms": 1.2
      },
      "response_times": {
        "min_ms": 0.5,
        "max_ms": 150.0,
        "average_ms": 23.4
      },
      "error_rates": {
        "total_requests": 100,
        "error_requests": 2,
        "error_percentage": 2.0
      }
    },
    "diagnostics": {
      "message": "All subsystems are running optimally.",
      "troubleshooting_steps": []
    },
    "historical_metrics": [
      {
        "timestamp": "2026-06-04T15:17:20Z",
        "operation": "/item/search",
        "latency_ms": 12.5,
        "status": "success"
      }
    ]
  }
  ```

---

## 3. Metrics Collection

1. **In-Memory Buffer**: The service maintains a thread-safe sliding window (ring-buffer) of the most recent 1000 operation records.
2. **Operation Logging**: Developers and wrappers record calls using the service method:
   `health_service.record_metric(operation: str, latency_ms: float, status: str)`
   Where status is `"success"` or `"error"`.
3. **Database Checks**: Runs light queries on table schemas (`SELECT 1 FROM users LIMIT 1`) to verify SQLite connection health.
