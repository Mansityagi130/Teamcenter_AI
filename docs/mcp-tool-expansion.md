# Teamcenter MCP Server Tool Expansion

This document outlines the expanded Model Context Protocol (MCP) tool set introduced in the Teamcenter AI Copilot server. These tools allow the AI assistant to perform schema queries, fetch dynamic properties, run advanced metadata searches, view health diagnostics, and inspect catalog endpoints directly.

---

## 1. Newly Added MCP Tools

### Metadata Discovery

#### `get_object_types()` -> `dict`
* **Description**: Lists all supported object types in the metadata catalog (e.g. `Item`, `ItemRevision`, `Dataset`, `Form`, `Folder`, `Workflow`).
* **Parameters**: None.
* **Backend Target**: `GET /api/metadata/types`

#### `get_property_schema(type_name: str)` -> `dict`
* **Description**: Retrieves full database schema, column types, and constraints for a specified object type.
* **Parameters**:
  * `type_name` (string, required): The target object type to query (case-sensitive).
* **Backend Target**: `GET /api/metadata/types/{type_name}`

#### `get_relationships()` -> `dict`
* **Description**: Returns all pre-configured system relationships connecting different object types.
* **Parameters**: None.
* **Backend Target**: `GET /api/metadata/relationships`

---

### Property Retrieval

#### `get_property(object_type: str, object_id: str, property_name: str)` -> `dict`
* **Description**: Retrieves a single property value for a specified Teamcenter object.
* **Parameters**:
  * `object_type` (string, required): The target type (e.g., `Item`, `Dataset`, `Folder`).
  * `object_id` (string, required): Unique identifier of the object.
  * `property_name` (string, required): Specific property attribute name.
* **Backend Target**: `GET /api/properties/property`

#### `get_properties(object_type: str, object_id: str, property_list: list[str])` -> `dict`
* **Description**: Retrieves a batch of specific property values for a specified object.
* **Parameters**:
  * `object_type` (string, required): The target type.
  * `object_id` (string, required): Unique identifier of the object.
  * `property_list` (array of strings, required): List of property names to fetch.
* **Backend Target**: `POST /api/properties/batch`

#### `get_all_properties(object_type: str, object_id: str)` -> `dict`
* **Description**: Retrieves all properties for a specified object.
* **Parameters**:
  * `object_type` (string, required): The target type.
  * `object_id` (string, required): Unique identifier of the object.
* **Backend Target**: `GET /api/properties/all`

---

### Advanced Search

#### `advanced_search(query: Optional[str] = None, filters: Optional[dict] = None, sort_by: str = "relevance", sort_order: str = "desc", limit: int = 10, offset: int = 0)` -> `dict`
* **Description**: Executes complex database queries with filtering, sorting, pagination, and match relevance ranking.
* **Parameters**:
  * `query` (string, optional): Keyword search pattern.
  * `filters` (object, optional): Sub-properties to filter results (`type`, `owner`, `status`, `start_date`, `end_date`).
  * `sort_by` (string, optional): Attribute to sort results by. Defaults to `"relevance"`.
  * `sort_order` (string, optional): Order (`"asc"` or `"desc"`). Defaults to `"desc"`.
  * `limit` (integer, optional): Maximum result count. Defaults to `10`.
  * `offset` (integer, optional): Index slicing offset. Defaults to `0`.
* **Backend Target**: `POST /api/advanced-search/query`

#### `search_workflows(item_id: Optional[str] = None)` -> `dict`
* **Description**: Searches workflows in the database, optionally filtering by associated item ID.
* **Parameters**:
  * `item_id` (string, optional): Filter workflows attached to this item revision.
* **Backend Target**: `POST /workflow/list`

---

### Health Monitoring

#### `check_teamcenter_health()` -> `dict`
* **Description**: Retrieves the complete health report including database diagnostics, latency performance averages, error percentages, and troubleshooting guidelines.
* **Parameters**: None.
* **Backend Target**: `GET /teamcenter/health`

#### `check_sessions()` -> `dict`
* **Description**: Isolates and returns session health parameters (active and expired sessions).
* **Parameters**: None.
* **Backend Target**: `GET /teamcenter/health` (extracts `session_health` metrics block)

#### `check_authentication()` -> `dict`
* **Description**: Isolates and returns authentication and system settings health status.
* **Parameters**: None.
* **Backend Target**: `GET /teamcenter/health` (extracts `authentication_health` metrics block)

---

### API Discovery

#### `list_available_apis(category: Optional[str] = None)` -> `dict`
* **Description**: Lists registered Teamcenter REST endpoints from the API Catalog, optionally filtered by category.
* **Parameters**:
  * `category` (string, optional): Target category (e.g. `Items`, `Datasets`, `BOM`, `Workflow`, `Users`, `Projects`).
* **Backend Target**: `GET /api/catalog`

#### `search_api_catalog(query: str)` -> `dict`
* **Description**: Performs free-text keyword search across catalogued endpoint names, categories, and descriptions.
* **Parameters**:
  * `query` (string, required): Term to match.
* **Backend Target**: `GET /api/catalog` (using parameter `q`)

---

## 2. Robust Execution & Error Handling
All expanded tools leverage `FastMCP`'s auto-registration capabilities. Parameters utilize Python type hints to ensure proper client-side argument validation. If validation fails or a request transport error occurs, the server yields clean, descriptive JSON error states (preventing terminal subprocess crashes).
All invocations trace through system loggers using standard level outputs.
