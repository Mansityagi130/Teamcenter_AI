# Application Screenshots Checklist

This directory is designated for project screenshots. Adding these images will significantly enhance your GitHub repository's visual appeal for recruiters and visitors.

---

## 📷 Screenshots Checklist

- [ ] **1. Login Screen** (`login.png`)
  * **Description**: The high-contrast dark theme login/authentication screen.
  * **Key Elements**: Logo, Brand Name "Teamcenter AI", Input forms, and "Sign In" / "Sign Up" tabs.
  * **Tip**: Keep the window size standard (e.g., 1280x800) for clean aspect ratio.

- [ ] **2. AI Copilot Screen** (`copilot.png`)
  * **Description**: The main chat screen showing interactions with the PLM AI.
  * **Key Elements**: Interactive chat area with mathematical / concept replies, dynamic tool calls displayed in the terminal logs sidebar, and active workflow slot-filling checklists.

- [ ] **3. System Dashboard** (`dashboard.png`)
  * **Description**: The main metrics and system health interface.
  * **Key Elements**: Active database health checks (FastAPI, SQLite, API connections), token usage charts, and system component layouts.

- [ ] **4. User Management Control** (`user-management.png`)
  * **Description**: Role-Based Access Control settings panel.
  * **Key Elements**: List of users, role drop-downs (`Administrator`, `Chief Engineer`, `Standard User`), and permission modification toggles.

- [ ] **5. MCP Tool Explorer** (`mcp-explorer.png`)
  * **Description**: Interactive list of available Model Context Protocol tools.
  * **Key Elements**: Registered tool functions, parameter types, description logs, and raw endpoint diagnostic tests.

---

## 💡 How to Add Screenshots
1. Run the project locally:
   * Backend: `python -m uvicorn backend:app --port 8080`
   * Frontend: `cd frontend_src && npm run dev`
2. Open your browser to [http://localhost:5173/static/](http://localhost:5173/static/).
3. Use a screenshot utility (such as Windows Snapping Tool `Win + Shift + S`) to capture clean captures of each interface.
4. Save the captures with their respective names (`login.png`, `copilot.png`, `dashboard.png`, `user-management.png`, `mcp-explorer.png`) in this folder (`docs/screenshots/`).
5. Stage and push the screenshots to update your GitHub repository.
