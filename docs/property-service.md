# Teamcenter Property Retrieval Service

The Teamcenter Property Retrieval Service is a standalone module designed to query any metadata property for Teamcenter object types dynamically.

---

## 1. System Design

The Property Retrieval Service acts as an intermediary layer between business logic and the database:

```text
       +--------------------------------------------+
       |           Client Service / Tools           |
       +--------------------------------------------+
                             │
                             ▼
       +--------------------------------------------+
       |         TeamcenterPropertyService          |
       |  ┌──────────────────┐  ┌────────────────┐  |
       |  │  TTL Cache Store │  │ Input Validator│  |
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

### Exceptions
- `InvalidObjectTypeException`: Raised when an unsupported object type is passed.
- `ObjectNotFoundException`: Raised when the target object ID does not exist.
- `PropertyNotFoundException`: Raised when requesting a property that does not exist on the object type.

### Methods

#### `get_property(object_type: str, object_id: str, property_name: str) -> Any`
Retrieves a single property value for a specified object.
- **Example**: `get_property("Item", "VALVE_100", "item_name")`

#### `get_properties(object_type: str, object_id: str, property_list: List[str]) -> Dict[str, Any]`
Retrieves a dictionary of specified property values for a specified object.
- **Example**: `get_properties("Item", "VALVE_100", ["item_name", "item_description"])`

#### `get_all_properties(object_type: str, object_id: str) -> Dict[str, Any]`
Retrieves all property values for a specified object.
- **Example**: `get_all_properties("Workflow", "WF_VALVE")`

---

## 3. Supported Object Types

| Object Type | Target Table | Valid Properties |
| :--- | :--- | :--- |
| **Item** | `items` | `item_id`, `item_name`, `item_description`, `createdAt`, `updatedAt`, `createdBy` |
| **ItemRevision** | `revisions` | `revision_id`, `item_id`, `createdAt`, `updatedAt`, `createdBy` |
| **Dataset** | `datasets` | `dataset_id`, `dataset_name`, `item_id`, `createdAt`, `updatedAt`, `createdBy` |
| **Form** | `forms` | `form_id`, `form_name`, `form_type`, `createdAt`, `updatedAt`, `createdBy` |
| **Workflow** | `workflows` | `workflow_id`, `workflow_name`, `workflow_status`, `revision_row_id`, `createdAt`, `updatedAt`, `createdBy` |
| **Folder** | `folders` | `folder_id`, `folder_name`, `folder_description`, `createdAt`, `updatedAt`, `createdBy` |

---

## 4. Cache & Expiration
- Pre-configured with a Time-To-Live (TTL) cache (default 60 seconds) to prevent redundant database hits.
- Caches entire object property sets dynamically on load.
- Automatically evicts items on expiration.

---

## 5. Structured Logging
- Uses dedicated logger `teamcenter.property_service`.
- Generates structured messages containing key execution metrics (e.g. `action=get_property status=success object_type=Item object_id=VALVE_100 duration_ms=1.2 cache_hit=true`).
