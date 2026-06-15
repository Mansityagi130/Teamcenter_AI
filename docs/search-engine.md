# Advanced Teamcenter Search Engine

The Advanced Teamcenter Search Engine is a standalone service designed to execute multi-attribute database queries with robust filtering, sorting, pagination, and a relevance-based result ranking algorithm.

---

## 1. System Architecture

The search engine acts as a query-processing pipeline that transforms client request parameters into dynamic SQLite queries:

```text
        +--------------------------------------------+
        |                 AI / Client                |
        +--------------------------------------------+
                              │
                              ▼
        +--------------------------------------------+
        |        FastAPI /api/advanced-search        |
        +--------------------------------------------+
                              │
                              ▼
        +--------------------------------------------+
        |         TeamcenterSearchEngine             |
        |  ┌──────────────────┐  ┌────────────────┐  |
        |  │ Query builder    │  │ Relevance Rank │  |
        |  │ & SQLite Joins   │  │ Scoring Engine │  |
        |  └──────────────────┘  └────────────────┘  |
        +--------------------------------------------+
                              │
                              ▼
        +--------------------------------------------+
        |         SQLite Database (teamcenter.db)    |
        +--------------------------------------------+
```

---

## 2. API Reference

All requests must include a valid `X-API-Key` header.

### Advanced Search Query
- **URL**: `POST /api/advanced-search/query`
- **Request Body**:
  ```json
  {
    "query": "valve",
    "filters": {
      "type": "Item",
      "owner": "system",
      "status": "Approved",
      "start_date": "2026-06-01T00:00:00",
      "end_date": "2026-06-05T00:00:00"
    },
    "sort_by": "relevance",
    "sort_order": "desc",
    "limit": 10,
    "offset": 0
  }
  ```
- **Response**:
  ```json
  {
    "total_results": 1,
    "limit": 10,
    "offset": 0,
    "results": [
      {
        "id": "VALVE_100",
        "name": "Control Valve",
        "type": "Item",
        "description": "Main flow control valve",
        "owner": "system",
        "createdAt": "2026-06-04T15:06:36.105524",
        "updatedAt": "2026-06-04T15:06:36.105524",
        "workflow_status": "Approved",
        "score": 140.0
      }
    ]
  }
  ```

---

## 3. Relevance Rank Scoring

To provide premium, state-of-the-art search results, the search engine ranks results by relevance scoring:
- **Exact ID Match**: `+100` points
- **Partial ID Match (Substring)**: `+50` points
- **Exact Name Match**: `+80` points
- **Partial Name Match (Substring)**: `+40` points
- **Description Match**: `+10` points

Scores are aggregated for each matching record. If `sort_by` is set to `"relevance"` (default), results are returned ordered from highest score to lowest.

---

## 4. Multi-Table Joint Schemas
The search engine queries across six entity tables: `items`, `revisions`, `datasets`, `forms`, `folders`, and `workflows`.
To support status filtering on `Item` or `ItemRevision` types, it automatically builds LEFT JOIN queries with the `workflows` table (resolved through compound foreign keys).
