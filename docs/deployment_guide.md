# Deployment Guide: Vercel (Frontend) & Render (Backend)

This guide walks you through deploying your Teamcenter AI application with the **React frontend on Vercel** and the **FastAPI backend on Render**. This split architecture provides high speed, low cost, and reliable hosting.

---

## 1. Deploying the Backend on Render

Render runs the Python FastAPI service. Since Render containers are ephemeral, we must configure a **Persistent Volume (Disk)** to keep your SQLite database (`teamcenter.db`) intact.

### Step 1: Create a Web Service
1. Log in to [Render](https://render.com/).
2. Click **New +** and select **Web Service**.
3. Connect your GitHub/GitLab repository.
4. Set the following details:
   - **Name**: `teamcenter-ai-backend` (or your choice)
   - **Environment/Runtime**: `Python`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn backend:app --host 0.0.0.0 --port 10000` *(Render sets standard PORT environment variable; Uvicorn binds to all interfaces)*

### Step 2: Configure a Persistent Disk
1. Scroll down to the **Advanced** section of the creation page (or go to **Settings** > **Disks** after creating).
2. Click **Add Disk**:
   - **Name**: `sqlite-data`
   - **Mount Path**: `/var/data`
   - **Size**: `1 GiB` (more than enough for SQLite logs/items database)
3. Set the environment variable `DATABASE_PATH` to `/var/data/teamcenter.db`. FastAPI will automatically create and persist the database at this location.

### Step 3: Add Environment Variables
In the Render Web Service dashboard under the **Environment** tab, add:

| Key | Value | Notes |
| :--- | :--- | :--- |
| `DATABASE_PATH` | `/var/data/teamcenter.db` | Points database to the persistent disk mount path |
| `WORKFLOW_STATE_PATH` | `/var/data/workflow_state.json` | Persists user workflow states on disk |
| `Gemini_API_Key` | `YOUR_GEMINI_API_KEY` | Your Google Gemini API Key |
| `Gemini_Model_Name` | `gemini-3-flash-preview` | Gemini model name |
| `ADMIN_TOKEN` | `your-secure-admin-token-here` | Secret token to authenticate admin actions |
| `SHOW_ADMIN_TOKEN_ON_SITE` | `false` | Disable displaying admin tokens on site in production |
| `DAILY_CHAT_LIMIT` | `500` | Chat limit quota |
| `ALLOWED_ORIGINS` | `https://your-app.vercel.app` | URL of your deployed Vercel frontend (CORS protection) |

---

## 2. Deploying the Frontend on Vercel

Vercel is optimized for building and serving Vite/React applications.

### Step 1: Import Project to Vercel
1. Log in to [Vercel](https://vercel.com/).
2. Click **Add New** > **Project** and import your Git repository.
3. On the configuration screen, change the **Root Directory** to `frontend_src`. Vercel will automatically detect that this is a Vite-based project.

### Step 2: Configure Build Command & Directory Override
Open the **Build and Development Settings** dropdown:
1. Ensure the Framework Preset is set to **Vite**.
2. **Vercel defaults** will run `npm run build` and expect output in the `dist` folder. That is exactly what we want!

### Step 3: Configure Environment Variables
Add the following **Environment Variables** in the Vercel project configuration:

| Key | Value | Description |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `https://your-backend-app.onrender.com` | **Crucial**: Replace with the URL of your deployed Render backend web service |
| `VITE_BASE_PATH` | `/` | Changes base path from the local default (`/static/`) to root |
| `VITE_OUT_DIR` | `dist` | Directs Vite build output to standard folder `dist` for Vercel hosting |

### Step 4: Click Deploy!
Vercel will build the frontend, install node packages, compile the production bundle, and deploy it to a `.vercel.app` domain.

---

## 3. Post-Deployment Verification

1. Open your Vercel URL (e.g., `https://teamcenter-ai.vercel.app`).
2. Go to the Sign Up/Login screen and register a test user.
3. Check the developer console (F12) to verify there are no CORS errors.
4. Confirm database persistence by creating a Teamcenter item, logging out, restarting the Render service (optional), and verifying the item is still listed when you log back in.
