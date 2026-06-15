# Vercel Disconnection & Project Deletion Guide

If your project is experiencing failed GitHub deployment checks or Vercel build errors, you can safely disconnect and delete the Vercel project. Since this repository is intended purely as a **GitHub portfolio showcase**, hosting it live on Vercel is not required.

---

## 🛠️ Step-by-Step Instructions

### Part A: Disconnecting the Repository from Vercel
To prevent Vercel from automatically triggering build checks whenever you push new commits to GitHub:

1. Log in to your account on [Vercel](https://vercel.com).
2. Open your project dashboard (e.g., `Teamcenter_AI`).
3. Click on the **Settings** tab at the top of the project dashboard.
4. From the left sidebar menu, select **Git**.
5. Scroll down to the **Connected Git Repository** section.
6. Click the **Disconnect** button next to your GitHub repository details.
7. Confirm the action when prompted.

---

### Part B: Deleting the Vercel Project
If you want to completely clean up your Vercel dashboard by deleting the project definition (recommended):

1. While in the **Settings** tab of your project on Vercel, select **Advanced** from the left sidebar menu.
2. Scroll to the bottom of the Advanced settings page until you reach the **Delete Project** section.
3. Click the **Delete** button.
4. Vercel will ask you to type the project name (e.g., `teamcenter-ai`) and confirm deletion.
5. Click **Delete Project** to confirm.

---

## 🔒 Safety and Code Integrity Confirmation

Deleting or disconnecting the Vercel project has **zero impact** on your workspace:
* **GitHub Repository**: Remains completely untouched. Your push history, branches, commits, and releases are fully preserved.
* **Source Code**: All React, TypeScript, FastAPI Python scripts, and database schema files remain intact.
* **Documentation**: All guides, architecture layouts, and markdown documentation files remain untouched.
* **Local Execution**: The project will continue to build, install, and run locally exactly as before. The local dev servers (`uvicorn` and `vite`) do not depend on Vercel configuration files.
