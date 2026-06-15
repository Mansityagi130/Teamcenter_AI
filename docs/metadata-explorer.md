# Teamcenter Metadata Explorer

The Teamcenter Metadata Explorer is a standalone module designed to discover Teamcenter schema, property constraints, relationships, dataset types, and workflow types dynamically.

---

## 1. System Design

The Metadata Explorer exposes endpoints that inspect the underlying database schema and static mappings, providing a unified structure discovery mechanism for external clients and AI systems:

```text
        +--------------------------------------------+
        |                 AI / Client                |
        +--------------------------------------------+
                              │
                              ▼
        +--------------------------------------------+
        |            FastAPI /api/metadata           |
        +--------------------------------------------+
                              │
                              ▼
        +--------------------------------------------+
        |         TeamcenterMetadataService          |
        |  ┌──────────────────┐  ┌────────────────┐  |
        |  │  TTL Cache Store │  │Schema Explorer │  |
        |  └──────────────────┘  └────────────────┘  |
        |          (Inspects PRAGMA table_info)      |
        +--------------------------------------------+
                              │
                              ▼
        +--------------------------------------------+
        |         SQLite Database (teamcenter.db)    |
        +--------------------------------------------+
```

---

## 2. API Endpoints

All metadata APIs require an `X-API-Key` header for authentication.

### List Supported Object Types
- **URL**: `GET /api/metadata/types`
- **Response**: List of strings containing supported object types:
  ```json
  [
    "Item",
    "ItemRevision",
    "Dataset",
    "Form",
    "Folder",
    "Workflow"
  ]
  ```

### Get Object Type Details
- **URL**: `GET /api/metadata/types/{type_name}`
- **Response**: Details of properties and relationships associated with the object type:
  ```json
  {
    "object_type": "Item",
    "properties": [
      {
        "name": "item_id",
        "type": "String",
        "required": true
      },
      {
        "name": "item_name",
        "type": "String",
        "required": true
      }
    ],
    "relationships": [
      {
        "target": "ItemRevision",
        "type": "One-to-Many",
        "description": "An Item owns multiple Revisions."
      }
    ]
  }
  ```

### List Relationships
- **URL**: `GET /api/metadata/relationships`
- **Response**: All relationships configured between object types.

### List Dataset Types
- **URL**: `GET /api/metadata/datasets/types`
- **Response**: List of registered dataset file types (e.g. `PDF`, `DirectModel`, `Text`, etc.).

### List Workflow Types
- **URL**: `GET /api/metadata/workflows/types`
- **Response**: List of registered workflow templates/types.

### Search Metadata
- **URL**: `GET /api/metadata/search?q={search_query}`
- **Response**: Matching object types, properties, and relationships.

---

## 3. Metadata Discovery Engine

To avoid hardcoded properties drifting from database definitions, the Metadata Explorer dynamically runs `PRAGMA table_info(table_name)` queries. This returns:
1. Column names.
2. Data types (mapped to `String`, `Integer`, `DateTime` representations).
3. Nullability constraints (mapped to the `required` flag).

---

## 4. Caching & Thread Safety
- The service caches metadata responses in-memory using a configurable TTL cache (default 60 seconds).
- The cache reduces DB access overhead for metadata queries.
