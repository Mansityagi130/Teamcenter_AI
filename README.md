# Teamcenter AI Copilot & PLM Assistant

An intelligent, multi-layer conversational assistant and copilot designed for **Siemens Teamcenter PLM** systems. The assistant behaves as a hybrid **PLM Copilot + Teamcenter Database Assistant + General AI Assistant**, utilizing a custom FastMCP server, stateful slot-filling workflow memory, and direct Gemini LLM routing.

---

## 📖 Project Overview
This project provides an enterprise-ready conversational interface for Siemens Teamcenter PLM. By integrating Large Language Models (Google Gemini) with Model Context Protocol (MCP) and stateful local workflows, it allows engineers, administrators, and users to search PLM records, view and edit Teamcenter items, start workflows, inspect properties, and monitor system health through natural language queries.

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

## 🔮 Future Scope

* **Teamcenter Authentication**: Native integration with Siemens Teamcenter Security Services.
* **SSO (Single Sign-On)**: Active Directory, SAML, and OAuth2 enterprise SSO support.
* **Enterprise Deployment**: Dockerized container deployment with Kubernetes scaling and PostgreSQL storage engine.

---

* **Last Updated**: June 16, 2026 (GitHub Portfolio Showcase Pass)

