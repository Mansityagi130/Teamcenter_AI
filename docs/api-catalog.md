# Teamcenter API Catalog

The Teamcenter API Catalog is a standalone documentation and analytics subsystem designed to register Teamcenter REST API routes, manage metadata schema information, search/filter route properties, and aggregate dynamic usage statistics directly from backend transaction logs.

---

## 1. System Design

The API Catalog registry compiles endpoint data and links directly with the SQLite activity log parser to return usage statistics:

```text
        +--------------------------------------------+
        |                 AI / Client                |
        +--------------------------------------------+
                              │
                              ▼
        +--------------------------------------------+
        |            FastAPI /api/catalog            |
        +--------------------------------------------+
                              │
                              ▼
        +--------------------------------------------+
        |           TeamcenterApiCatalog             |
        |  ┌──────────────────┐  ┌────────────────┐  |
        |  │ Endpoint Registry│  │ Activity Logs  │  |
        |  │                  │  │ Query Engine   │  |
        |  └──────────────────┘  └────────────────┘  |
        +--------------------------------------------+
                              │
                              ▼
        +--------------------------------------------+
        |         SQLite Database (teamcenter.db)    |
        |           (Reads from activity_logs)       |
        +--------------------------------------------+
```

---

## 2. API Reference

All routes require a valid `X-API-Key` header.

### List API Catalog
- **URL**: `GET /api/catalog`
- **Query Params**:
  - `category`: Filter by category (e.g. Items, Datasets, BOM, Workflow, Users, Projects).
  - `q`: Search keyword.
- **Response**:
  ```json
  [
    {
      "method": "POST",
      "endpoint": "/item/search",
      "category": "Items",
      "description": "Searches for Teamcenter items by ID or name."
    }
  ]
  ```

### Get API Metadata
- **URL**: `GET /api/catalog/metadata`
- **Query Params**:
  - `method`: HTTP Verb (e.g. POST)
  - `endpoint`: Target endpoint (e.g. /item/search)
- **Response**:
  ```json
  {
    "method": "POST",
    "endpoint": "/item/search",
    "category": "Items",
    "description": "Searches for Teamcenter items by ID or name.",
    "parameters": {
      "item_id": {
        "type": "String",
        "required": true,
        "description": "Unique ID of the item."
      }
    }
  }
  ```

### Get API Usage Statistics
- **URL**: `GET /api/catalog/statistics`
- **Query Params**:
  - `method`: HTTP Verb (e.g. POST)
  - `endpoint`: Target endpoint (e.g. /item/search)
- **Response**:
  ```json
  {
    "method": "POST",
    "endpoint": "/item/search",
    "invocation_count": 42,
    "unique_users_count": 3,
    "last_invoked_at": "2026-06-04T12:00:00Z"
  }
  ```

### Get Summary Statistics
- **URL**: `GET /api/catalog/statistics/all`
- **Response**:
  ```json
  {
    "/item/search": {
      "method": "POST",
      "invocation_count": 42
    },
    "/dataset/add": {
      "method": "POST",
      "invocation_count": 12
    }
  }
  ```

---

## 3. Catalog Categories

The following categories are pre-configured in the metadata registry:
* **Items**: Endpoints for item creation, search, listing, and updates.
* **Datasets**: Endpoints for dataset association, list, and file download references.
* **BOM**: Assembly relation get and expand structures.
* **Workflow**: Creation, routing, and approving workflows.
* **Users**: Registration, logins, token generation, and password resets.
* **Projects**: Future project-centric endpoints.
