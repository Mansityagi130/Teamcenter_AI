# Recruiter Review & Technical Audit Guide

This document is designed to help technical recruiters and hiring managers audit this project and highlights the specific engineering concepts and talking points to discuss during interviews.

---

## 🎯 What a Recruiter Sees First
1. **Clear, Production-Ready Architecture**: The repository structure separates source code, documentation, mock assets, and build outputs cleanly.
2. **Comprehensive Documentation**: A professional onboarding README with diagrams, installation steps, and demo credentials makes the project immediately runnable.
3. **Advanced AI Integration (MCP)**: Instead of a simple chatbot, the project utilizes the new Model Context Protocol (MCP) to dynamically link an LLM to local database tools.

---

## 💪 Key Strengths of the Project
* **Practical Enterprise Context**: Solves a real-world problem (simplifying complex PLM database tasks in Siemens Teamcenter) rather than a generic utility.
* **Extremely High Responsiveness**: Achieves sub-40ms response times for concept lookups by implementing a three-layer routing engine.
* **Full-Stack Competency**: Combines structured FastAPI endpoints with a custom React/Redux SPA.

---

## 📐 Concepts Demonstrated

### 1. Enterprise Software Concepts
* **Model Context Protocol (MCP)**: Implemented a FastMCP stdio server to expose database capabilities dynamically.
* **BOM (Bill of Materials) Processing**: Designed relational schemas and algorithms to build, query, and recursively expand component trees.
* **Slot-Filling Workflows**: Built stateful checkers to conversationally prompt users for missing transaction arguments.

### 2. AI & LLM Engineering
* **Three-Layer Intent Routing**: Classification system directing prompts to casual local handlers, MCP servers, or direct generative completions based on context.
* **Generative Token Optimization**: Rate-limits chats dynamically to control API quotas.

### 3. Backend Engineering (FastAPI)
* **Asynchronous Thread Offloading**: Offloads heavy AI client calls using `asyncio.to_thread` to prevent blocking FastAPI's single-threaded event loop.
* **SQLite Database Layer**: Uses custom parameterized query routers to prevent SQL injections.
* **Automated Log Rotation**: Background maintenance loops that prune audit tables older than 365 days once a day.

### 4. Frontend Engineering (React / TypeScript)
* **Global State Architecture**: Manages sessions, preferences, and notifications using Redux Toolkit.
* **Theme-Stable UI Elements**: Dark-theme variables for logins and centralized popover controller managers with click-outside listener dismissals.
* **Dynamic Loading Indicators**: Stackable, timed notifications (Toasts) and live CLI terminal emulation blocks.

### 5. Security & Governance
* **Role-Based Access Control (RBAC)**: Distinct permissions for `Administrator`, `Chief Engineer`, and `Standard User`.
* **Administrative Self-Lockout Protection**: API validations that prevent changing or removing the last Administrator user to protect security integrity.
* **Structured Audit Trail**: Captures UTC timestamps, user IDs, client IP addresses, browser User-Agent strings, and old-to-new value diffs.

---

## 💬 Suggested Interview Talking Points

* **"How did you prevent the single-threaded FastAPI event loop from blocking during high-latency LLM calls?"**
  * *Answer*: "I offloaded all blocking synchronous generative completions to worker threads using `asyncio.to_thread`. This kept the main event loop responsive for routine API calls and health queries."
* **"Why did you use the Model Context Protocol (MCP) instead of hardcoding LLM function declarations?"**
  * *Answer*: "Using MCP decouples the tool definitions from the LLM client configuration. The FastMCP server dynamically registers, describes, and validates tools over standard stdio channels, making the service modular and reusable by other AI clients."
* **"How did you implement the slot-filling conversational engine?"**
  * *Answer*: "I designed a workflow validation engine in `workflow.py` that retains active state parameters. For every user message, the system evaluates missing parameters against the checklist. Once all slots (e.g. `itemId`, `revisionId`) are satisfied, the system triggers the transaction."
