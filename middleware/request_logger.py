import time
from typing import Optional
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from services.observability import get_db_connection, log_request


class RequestLoggerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        method = request.method

        if path.startswith("/static"):
            return await call_next(request)

        start = time.perf_counter()
        status_code = 500
        error_message = None

        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        except Exception as exc:
            status_code = 500
            error_message = str(exc)
            raise
        finally:
            duration_ms = (time.perf_counter() - start) * 1000.0
            user_id = self._resolve_user_id(request)
            service_name = self._classify_service(path)
            try:
                with get_db_connection() as conn:
                    log_request(
                        conn,
                        user_id,
                        method,
                        path,
                        status_code,
                        duration_ms,
                        error_message=error_message,
                        service=service_name,
                    )
            except Exception:
                # Swallow logging failures to avoid affecting request processing
                pass

    def _classify_service(self, path: str) -> str:
        if path.startswith("/api/mcp"):
            return "mcp"
        if path.startswith("/api/teamcenter") or path.startswith("/item/") or path.startswith("/dataset/") or path.startswith("/workflow/") or path.startswith("/search/") or path.startswith("/property/") or path.startswith("/bom/"):
            return "teamcenter"
        return "http"

    def _resolve_user_id(self, request: Request) -> Optional[str]:
        api_key = request.headers.get("X-API-Key")
        if api_key:
            api_key = api_key.strip()
            if api_key:
                try:
                    with get_db_connection() as conn:
                        row = conn.execute("SELECT username FROM users WHERE api_key = ?", (api_key,)).fetchone()
                        if row:
                            return row["username"]
                except Exception:
                    return None

        authorization = request.headers.get("Authorization", "")
        if authorization.lower().startswith("bearer "):
            token = authorization.split(" ", 1)[1].strip()
            try:
                from backend import verify_jwt

                payload = verify_jwt(token)
                return payload.get("sub")
            except Exception:
                return None

        return None
