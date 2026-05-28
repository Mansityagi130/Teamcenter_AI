# AI Chat Application Architecture

## Backend Preference

Use FastAPI. The existing project is already Python-based, and FastAPI works well for streaming responses, async database access, background jobs, and MCP tool execution.

## Recommended Folder Structure

```text
backend/
  app/
    main.py
    config.py
    db.py
    models.py
    schemas.py
    security.py
    dependencies.py
    services/
      auth_service.py
      chat_service.py
      token_service.py
      mcp_service.py
    routers/
      auth.py
      chat.py
      settings.py
    workers/
      reset_daily_tokens.py
  migrations/
    001_initial.sql
  requirements.txt

frontend/
  app/
    layout.tsx
    page.tsx
    settings/
      page.tsx
  components/
    ChatLayout.tsx
    ChatSidebar.tsx
    ChatWindow.tsx
    MessageComposer.tsx
    TokenCounter.tsx
    SettingsPanel.tsx
    ApiKeyCard.tsx
    ActivityLog.tsx
  lib/
    api.ts
    types.ts
  tailwind.config.ts
```

## Data Model

The schema in `schema/ai_chat.sql` links users, hashed API keys, sessions, messages, token logs, activity logs, and optional MCP tool audit rows.

Key rules:

- API keys are shown only once after generation.
- Store only a SHA-256 HMAC hash of the API key.
- Clients send API keys with `X-API-KEY`.
- Chat sessions persist independently of login sessions.
- Token quota is enforced against a daily usage counter plus append-only logs.

## Request Flow

1. User registers.
2. Backend creates user and one API key.
3. User logs in.
4. Backend creates a new chat session and returns JWT plus session id.
5. Frontend streams messages to `/chat/sessions/{session_id}/messages`.
6. Backend verifies JWT or API key, checks remaining daily token quota, calls MCP tools if the model asks for tools, streams output, then stores messages and token logs.
7. Settings page can reveal only the currently held key client-side. Regeneration invalidates the previous key and returns a new key once.

## Daily Token Reset

Run `backend/app/workers/reset_daily_tokens.py` every 24 hours through one of:

```bash
python -m app.workers.reset_daily_tokens
```

Production options:

- Linux cron: `0 0 * * * cd /srv/ai-chat/backend && .venv/bin/python -m app.workers.reset_daily_tokens`
- Windows Task Scheduler: daily action running `python -m app.workers.reset_daily_tokens`
- Container: sidecar cron container or APScheduler process.

## MCP Integration

MCP belongs inside the chat service, not the frontend. The model can request a tool call, the backend executes the MCP tool server/client, records an audit row, and feeds the tool result back to the model before streaming the final answer.

The frontend should never directly invoke MCP tools with privileged credentials.

## Security Notes

- Use HTTPS in production.
- Hash passwords with Argon2 or bcrypt.
- Hash API keys with an application secret pepper.
- Never log raw API keys, JWTs, or model prompts containing secrets.
- Apply per-user and per-IP request throttles in addition to token quotas.
- Make API key regeneration rotate `key_hash` and increment `version`.
- Store model token usage in append-only `token_logs`.
