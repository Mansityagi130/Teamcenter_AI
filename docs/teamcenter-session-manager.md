# Enterprise Teamcenter Session Manager

The Enterprise Teamcenter Session Manager is a centralized, standalone module designed to manage authentication sessions with Teamcenter REST / SOA endpoints securely and efficiently.

---

## 1. System Architecture

```text
       +--------------------------------------------+
       |           Client Service (Future)          |
       +--------------------------------------------+
                             │
                             ▼
       +--------------------------------------------+
       |         TeamcenterSessionManager           | (Thread-safe registry)
       +--------------------------------------------+
         │                  │                  │
         ▼                  ▼                  ▼
+-----------------+ +-----------------+ +-----------------+
|  Active Session | |  Active Session | |  Expired/Stale  |
|   (User A)      | |   (User B)      | |   (Cleaned up)  |
+-----------------+ +-----------------+ +-----------------+
```

The session manager acts as an in-memory, thread-safe registry of active `TeamcenterSession` connections. It handles the lifecycle of HTTP sessions, cookie storage, and XSRF headers.

---

## 2. Component Design

### `TeamcenterSession`
Represents an authenticated connection state for a user. It contains:
- `username`: Teamcenter username.
- `cookies`: Dictionary of cookies (e.g. `JSESSIONID`).
- `xsrf_token`: XSRF token value (e.g. CSRF/XSRF token).
- `xsrf_header_name`: HTTP header name for the XSRF token (defaults to `X-XSRF-TOKEN`).
- `created_at`: Creation timestamp.
- `expires_at`: Expiration timestamp.
- `requests_session`: Pre-configured `requests.Session` object with cookies and tokens attached.

### `TeamcenterSessionManager`
Handles the lifecycle operations:
- **`get_or_create_session(username, password, base_url)`**: Attempts to retrieve an active valid session for the given user, automatically refreshing or re-creating it if expired.
- **`create_session(username, password, base_url)`**: Initiates a new connection request to Teamcenter's authentication endpoint, registers cookies/tokens, and registers the session.
- **`get_session(username)`**: Retrieves a session from registry, validating if it's expired.
- **`remove_session(username)`**: Terminates and removes a session from registry.
- **`cleanup_expired_sessions()`**: Iterates and purges expired sessions.

---

## 3. Integration & Usage

To use the session manager in future Teamcenter integration services:

```python
from backend.teamcenter.session_manager import TeamcenterSessionManager

# Initialize the manager
manager = TeamcenterSessionManager(session_timeout_seconds=3600)

# Retrieve a valid session (automatically logs in if no active session exists)
session = manager.get_or_create_session(
    username="tc_user",
    password="tc_password",
    base_url="http://teamcenter.example.com"
)

# Run HTTP requests using the pre-configured session
response = session.requests_session.get("http://teamcenter.example.com/tc/api/items/ABC123")
item_details = response.json()
```
