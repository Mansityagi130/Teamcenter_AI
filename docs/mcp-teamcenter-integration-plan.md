# MCP Teamcenter Integration Plan

This document outlines the design and implementation details for upgrading the Teamcenter AI Copilot to support the Model Context Protocol (MCP).

## 1. Current Architecture

Currently, the Teamcenter AI Copilot backend (`backend.py`) is structured as a FastAPI web application with local SQLite database storage for simulated Teamcenter data (items, revisions, datasets, workflows). 

The existing AI integration flow is:
* The user inputs a message via the frontend or `/api/chat` / `/chat/message` endpoints.
* The backend classifies the message intent (casual, teamcenter_technical, general_coding).
* If the intent is `teamcenter_technical`, the backend registers a set of local Python functions (such as `add_item_tool`, `list_items_tool`, `search_item_tool`) as tools directly on the Gemini SDK level.
* The Gemini model runs, and if it requests a tool call, the backend executes the local Python function and returns the results to the model, which generates the final answer.
* A separate CLI utility `llm.py` and a basic FastMCP server `test_mcp.py` exist in the repository but are not integrated with the main web application's chat system.

---

## 2. Target Architecture

The upgraded architecture follows a clean layer separation as requested:

```text
User
  ↓
AI Copilot (backend.py / Chat Endpoints)
  ↓
MCP Tool Layer (MCP Client in backend.py running mcp_server.py as subprocess)
  ↓
Teamcenter Service Layer (mcp_server.py invoking tc_api_client.py)
  ↓
Teamcenter REST APIs (FastAPI Endpoints in backend.py)
  ↓
SQLite Database (teamcenter.db)
```

1. **User Interface**: Submits queries to the copilot chat endpoints.
2. **AI Copilot**: Hosts the Gemini chat agent, connects to the MCP Server over a stdio channel, discovers tool declarations, registers them as function declarations for the LLM, and handles execution requests.
3. **MCP Tool Layer**: A FastMCP server (`mcp_server.py`) that defines and registers the Teamcenter tools, validates input parameter schemas, and handles errors.
4. **Teamcenter Service Layer**: A reusable API wrapper client (`tc_api_client.py`) that executes REST requests to the Teamcenter backend, reusing HTTP sessions, handling headers, retries, and errors.
5. **Teamcenter REST APIs**: The REST endpoints in `backend.py` (representing simulated PLM server endpoints).

---

## 3. Required Changes & New Modules

### A. New Modules

1. **`tc_api_client.py` (Teamcenter API Wrapper)**:
   * A Python wrapper using the `requests` library.
   * Manages connection to the Teamcenter REST API.
   * Handles user-specific authentication (`X-API-Key` and `Authorization` JWT headers).
   * Implements session reuse using `requests.Session`.
   * Implements robust retry logic (using `urllib3.util.Retry`) for handling network failures or transient errors.
   * Standardizes error responses into structured dictionaries.

2. **`mcp_server.py` (MCP Server)**:
   * A Python-based `FastMCP` server.
   * Registers the required Teamcenter operations as MCP tools.
   * Utilizes type hints for automatically generating JSON schemas for input validation.
   * Executes operations by invoking the `TeamcenterClient` to hit the REST API.
   * Handles errors gracefully and returns descriptive messages to the MCP client.

### B. Modified Files

1. **`backend.py` (FastAPI Server)**:
   * **BOM Management**: 
     * Implement a new SQLite table `bom_relations` to store parent-child item relationships.
     * Seed initial BOM data on startup (e.g. nested structure: `VALVE_100` -> `VALVE_BODY`, `STEM`, `ACTUATOR` -> `MOTOR`, `GEARBOX`).
     * Create REST endpoints `/bom/get` (retrieves direct children) and `/bom/expand` (recursively expands components).
   * **Workflow Approval**:
     * Create a REST endpoint `/workflow/approve` to update the workflow status to `Approved`.
   * **Dataset Download**:
     * Create a REST endpoint `/dataset/download/{dataset_id}` returning mock files (as `FileResponse`).
   * **MCP Integration**:
     * Convert chat handlers (`generate_and_save_response`, `/chat/message`, `/chat/message/edit`, `/api/chat`) to `async def` to support async MCP client operations.
     * Replace local tool registry references with the dynamic MCP Client stdio connection to `mcp_server.py`.
     * Run the MCP client stdio session with the current user's API key and JWT token, preserving security constraints.

---

## 4. Integration Approach

### Step 1: Database & Backend API Extensions
* Add table creation and initial data seeding for BOM to `init_db()`.
* Add new REST controllers in `backend.py` for BOM operations (`/bom/get`, `/bom/expand`), workflow approval (`/workflow/approve`), and dataset download (`/dataset/download/{dataset_id}`).

### Step 2: Implement Teamcenter API Client Wrapper
* Create `tc_api_client.py` with standard request routines, error boundaries, session pooling, and retries.

### Step 3: Implement MCP Server
* Create `mcp_server.py` and register the requested tools:
  * `search_items` -> `POST /item/search`
  * `get_item` -> `GET /search/item-id` (fetches item details along with revisions, datasets, and workflows)
  * `create_item` -> `POST /item/add`
  * `update_item` -> `POST /item/update`
  * `delete_item` -> `POST /item/delete`
  * `get_bom` -> `POST /bom/get`
  * `expand_bom` -> `POST /bom/expand`
  * `create_workflow` -> `POST /workflow/add`
  * `approve_workflow` -> `POST /workflow/approve`
  * `search_datasets` -> `POST /dataset/list`
  * `download_dataset` -> `GET /dataset/download/{dataset_id}`

### Step 4: Hook MCP Client to AI Chat
* Implement an async stdio client session inside `backend.py`'s `generate_and_save_response`.
* Build standard server parameters directing to `mcp_server.py` using `sys.executable` and injecting `BACKEND_URL`, `BACKEND_API_KEY`, and `BACKEND_JWT` in the environment variables.
* Fetch tool definitions from the MCP server, convert them to Gemini function declarations, and call the MCP server tools when Gemini requests a function call.

---

## 5. Verification Plan

### Automated/Unit Testing
* Write a test script `test_mcp_integration.py` that verifies:
  1. MCP server starts up and exposes the correct tools.
  2. Tools can be executed and query the REST endpoints successfully.
  3. BOM expand queries return the correct tree structure.

### Manual Verification
* Run the backend and verify the chat agent handles user prompts correctly via the frontend UI:
  * Prompt: "Find item VALVE_100" -> Triggers `search_items` / `get_item`.
  * Prompt: "Show BOM of VALVE_100" -> Triggers `get_bom`.
  * Prompt: "Expand BOM of VALVE_100" -> Triggers `expand_bom`.
  * Prompt: "Approve workflow WF_VALVE" -> Triggers `approve_workflow`.
  * Prompt: "Download dataset CAD_FILE" -> Triggers `download_dataset`.
