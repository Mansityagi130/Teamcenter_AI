# Teamcenter AI Copilot & PLM Assistant

An intelligent, multi-layer conversational assistant and copilot designed for **Siemens Teamcenter PLM** systems. The assistant behaves as a hybrid **PLM Copilot + Teamcenter Database Assistant + General AI Assistant**, utilizing a custom FastMCP server, stateful slot-filling workflow memory, and direct Gemini LLM routing.

---

## 📖 Project Overview
This project provides an enterprise-ready conversational interface for Siemens Teamcenter PLM. By integrating Large Language Models (Google Gemini) with Model Context Protocol (MCP) and stateful local workflows, it allows engineers, administrators, and users to search PLM records, view and edit Teamcenter items, start workflows, inspect properties, and monitor system health through natural language queries.

---

## 🎯 Why This Project?
Traditional Product Lifecycle Management (PLM) systems like Siemens Teamcenter are highly powerful but suffer from steep learning curves, dense hierarchical UIs, and complex navigation flows that slow down engineers. Simple tasks—such as finding a specific CAD dataset, checking approval status, or initiating revisions—often require multiple menus and deep training.

This project demonstrates **conversational engineering**: bringing natural language interaction to PLM metadata workflows. By combining Generative AI with the **Model Context Protocol (MCP)**, this Copilot bridges LLMs directly to backend PLM APIs safely and securely. Instead of navigating menus, engineers can query, update, and manage Teamcenter resources conversationally. The business value is clear: dramatic productivity gains, shortened engineering cycle times, and a frictionless onboarding experience for new team members.

---

## ✨ Features

* **AI Copilot**: Natural language conversational assistant utilizing dynamic routing for instant local heuristics responses, Teamcenter operations, or general-purpose questions.
* **MCP Integration**: Fully integrated Model Context Protocol (FastMCP) server to query and manage Teamcenter data via standard tools.
* **Teamcenter Operations**: Conversational, progressive slot-filling workflows to create items, datasets, revisions, and trigger processes with validation.
* **User Management & RBAC**: Granular Role-Based Access Control supporting roles like `Administrator`, `Chief Engineer`, and `Standard User` with permission-level enforcement on features.
* **Audit Logging**: Comprehensive activity logging detailing actor actions, IP addresses, user-agents, UTC timestamps, and data diffs.
* **Monitoring & Diagnostics**: Advanced database, API, and worker thread status monitoring with automatic log rotation/pruning.
* **Health Dashboard**: A visual real-time health indicator showing API, database, and backend connectivity states.
* **Security Logs**: Dedicated logging and visualization for critical security and administrative actions.

---

## 🔧 MCP Tool Ecosystem
This project integrates the **Model Context Protocol (MCP)** to serve as a secure gateway between the LLM and the backend, avoiding exposing the database directly. The FastMCP server dynamically registers **32 tools** classified into these operational domains:

* **Item Management**: Search, retrieve, update, and delete Teamcenter items and revisions.
* **BOM Operations**: Fetch direct components and recursively expand deep Bill of Materials (BOM) trees.
* **Workflow Management**: Create process templates, inspect progress, approve or reject engineering tasks, and list active workflows.
* **Dataset Operations**: Locate, search, and download mock engineering datasets and CAD files.
* **Metadata Discovery**: Dynamic schema queries listing supported object types and column constraints.
* **Property Services**: Read single, batch, or all dynamic metadata properties for specific Teamcenter components.
* **API Discovery**: Explore, search, and retrieve documentation and statistics for registered endpoints in the REST catalog.
* **Health Monitoring**: Retrieve database diagnostics, active session rates, and authentication logs.
* **User & Session Services**: Inspect profile configurations and active user session information.

---

## 🚀 Key Technical Highlights

* **Three-Layer AI Routing Engine**: Achieves sub-40ms concept lookups by intercepting exact keywords locally (Layer 1), dynamically routing PLM actions via an MCP client (Layer 2), and forwarding general queries directly to the Gemini LLM (Layer 3).
* **FastMCP Integration**: Exposes 32 secure, schema-validated database tools to the LLM over standard stdio channels, decoupling business logic from AI configuration.
* **Stateful Slot-Filling Workflows**: Conversationally extracts missing parameters for complex multi-step PLM creations (Items, Datasets, Revisions) before committing to the database.
* **JWT Authentication**: Secure stateless authentication and authorization flows utilizing cryptographically signed tokens.
* **Role-Based Access Control (RBAC)**: Fine-grained user permissions controlling access to health dashboards, raw consoles, user management, and security audits.
* **Audit Logging**: Structured log schema capturing timestamps, actor IDs, client IP addresses, browser User-Agent strings, and detailed database diffs.
* **Monitoring & Observability**: Real-time event log streaming and automated log maintenance routines that prune records older than 365 days.
* **Health Dashboard**: Dynamic React indicator monitors API, database, and background worker thread connectivity states.
* **SQLite PLM Data Simulation**: Implements parent-child BOM structures, workflow states, and user sessions in a local relational schema.
* **Enterprise Security Controls**: Restricts administrative role mutations to protect the system's last administrator from accidental self-lockouts.

---

## 🛠️ Tech Stack

* **Frontend**: React, TypeScript, Redux Toolkit, Vanilla CSS, Vite
* **Backend**: FastAPI (Python), Uvicorn, SQLite
* **AI & MCP**: Google Gemini API, Model Context Protocol (MCP)

---

## ⚙️ Installation

### Backend Setup
1. Navigate to the root directory and set up a virtual environment:
   ```bash
   python -m venv venv
   ```
2. Activate the virtual environment:
   * **Windows (PowerShell)**:
     ```powershell
     venv\Scripts\Activate.ps1
     ```
   * **Windows (CMD)**:
     ```cmd
     venv\Scripts\activate.bat
     ```
   * **Linux/macOS**:
     ```bash
     source venv/bin/activate
     ```
3. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Copy the environment template and set your API keys/secrets:
   ```bash
   copy .env.example .env
   ```
   *(On Linux/macOS: `cp .env.example .env`)*

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend_src
   ```
2. Install the package dependencies:
   ```bash
   npm install
   ```

---

## 🚀 Running the Project

### 1. Start the Backend Server
From the root directory with the virtual environment activated:
```bash
python -m uvicorn backend:app --host 127.0.0.1 --port 8080
```
*Note: The database `teamcenter.db` is initialized and seeded automatically on first run.*

### 2. Start the Frontend Server
From the `frontend_src` directory:
* **Windows (PowerShell)**:
  ```powershell
  $env:VITE_API_BASE_URL="http://127.0.0.1:8080"; npm run dev
  ```
* **Windows (CMD)**:
  ```cmd
  set VITE_API_BASE_URL=http://127.0.0.1:8080&& npm run dev
  ```
* **Linux/macOS**:
  ```bash
  VITE_API_BASE_URL="http://127.0.0.1:8080" npm run dev
  ```

---

## 🔑 Demo Accounts

The database is pre-seeded with the following roles and credentials for demonstration:

| Username | Password | Role | Features |
| :--- | :--- | :--- | :--- |
| `mansi` | `password123` | **Administrator** | User Management, Permissions Grant, MCP Explorer, Audit Logs |
| `test_chief` | `password123` | **Chief Engineer** | Observability Logs, Health Diagnostics, Security Audit |
| `test_user` | `password123` | **Standard User** | Chat Copilot, Simple Search, Properties, CAD Viewer |

---

## 📐 Architecture Overview

The application utilizes a multi-layer stack to process actions cleanly:

```text
[Frontend React App] ──(HTTP/WS)──> [Backend FastAPI] ──> [Database SQLite]
                                          │
                                          ├──> [MCP Client] ──> [FastMCP Server]
                                          │
                                          └──> [AI Models (Gemini API)]
```

### Flow description:
1. **Frontend**: Receives user input and presents UI screens, communicating with the backend APIs.
2. **Backend**: Inspects request routes. Layer-1 queries are resolved using local heuristics instantly; Layer-2 requests leverage the stateful workflow engine or the MCP client; Layer-3 general requests bypass MCP and go directly to the Gemini LLM.
3. **Database**: Stores persistent metadata, audit logs, and user sessions.
4. **MCP (Model Context Protocol)**: Bridges the LLM to database search capabilities via specialized JsonRPC interfaces.
5. **AI Models (Gemini)**: Processes complex conversational queries and classifies user intent.

---

## 💼 Skills Demonstrated

* **Full Stack Development**: End-to-end integration of React SPAs with FastAPI backend APIs and SQLite storage layers.
* **FastAPI Backend Engineering**: Asynchronous event loop offloading using `asyncio.to_thread` for non-blocking I/O operations.
* **React + TypeScript Development**: Redux state architectures, type-safe data pipelines, and responsive custom Vanilla CSS components.
* **Enterprise Security Design**: Cryptographic JWT authentication, Role-Based Access Control (RBAC), and self-lockout database guard rails.
* **AI/LLM Integration**: Intent routing classifiers, dynamic context prompting, and rate-limiting controls.
* **MCP (Model Context Protocol)**: Stdio-based subprocess execution and dynamic tool discovery.
* **Database Design**: Structured relational schemas, parent-child BOM indexes, and automated data rotation policies.
* **Authentication & Authorization**: Header-based token injection, session validation middleware, and user password hashing.
* **Observability & Monitoring**: Structured audit trailing, client header capturing, and real-time backend health tracking.
* **System Architecture Design**: Reusable wrappers, REST API catalogs, and decoupled tool layers.

---

## 🔮 Future Scope

* **Teamcenter Authentication**: Native integration with Siemens Teamcenter Security Services.
* **SSO (Single Sign-On)**: Active Directory, SAML, and OAuth2 enterprise SSO support.
* **Enterprise Deployment**: Dockerized container deployment with Kubernetes scaling and PostgreSQL storage engine.

---

* **Last Updated**: June 16, 2026 (GitHub Portfolio Showcase Pass)
