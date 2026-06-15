# Dynamic Teamcenter Endpoint Executor

The Dynamic Teamcenter Endpoint Executor is a standalone reusable utility designed to invoke arbitrary Teamcenter API endpoints with configurable methods, headers, query parameters, timeouts, error boundary checks, and custom retry logic.

---

## 1. System Architecture

The executor acts as a proxy client utility wrapping standard Python request mechanisms to guarantee robust execution:

```text
        +--------------------------------------------+
        |                 AI / Client                |
        +--------------------------------------------+
                              │
                              ▼
        +--------------------------------------------+
        |     FastAPI /api/dynamic-executor/execute  |
        +--------------------------------------------+
                              │
                              ▼
        +--------------------------------------------+
        |         TeamcenterDynamicExecutor          |
        |  ┌──────────────────┐  ┌────────────────┐  |
        |  │ Param Validation │  │ Timeout &      |  |
        |  │                  │  │ Retry Engine   |  |
        |  └──────────────────┘  └────────────────┘  |
        +--------------------------------------------+
                              │
                              ▼
        +--------------------------------------------+
        |           Target Teamcenter API            |
        +--------------------------------------------+
```

---

## 2. API Endpoints

Requests must be authenticated using the `X-API-Key` header.

### Execute Endpoint
- **URL**: `POST /api/dynamic-executor/execute`
- **Request Body**:
  ```json
  {
    "endpoint": "http://127.0.0.1:8000/health",
    "method": "GET",
    "headers": {
      "X-API-Key": "valid_api_key"
    },
    "params": {
      "verbose": "true"
    },
    "payload": null,
    "timeout": 10,
    "max_retries": 3
  }
  ```
- **Response**:
  ```json
  {
    "status_code": 200,
    "headers": {
      "content-type": "application/json",
      "content-length": "15"
    },
    "payload": {
      "status": "UP"
    },
    "elapsed_ms": 14.5,
    "retries_attempted": 0,
    "success": true
  }
  ```

---

## 3. Advanced Features

### Input Parameter Validation
- Ensures the HTTP method is one of: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`.
- Normalizes absolute and relative endpoint URLs.

### Custom Exponential Backoff Retry Strategy
- Catches transient connection errors and `5xx` server codes.
- Waits `0.5 * (2 ** attempt)` seconds before retrying to prevent overload on target servers.

### Structured Error Translation
Exposes custom exception types to prevent leaky library abstractions:
- `ValidationException` for malformed parameters.
- `ConnectionException` for transport failures.
- `ExecutionTimeoutException` for timed out calls.
