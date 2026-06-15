import os
import time
import logging
import requests
from typing import Any, Dict, Optional, Union
from .exceptions import (
    ValidationException,
    ConnectionException,
    ExecutionTimeoutException,
)

logger = logging.getLogger("teamcenter.dynamic_executor")

SUPPORTED_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}


class TeamcenterDynamicExecutor:
    """Dynamic Endpoint Executor for arbitrary Teamcenter integrations."""

    def __init__(self, default_base_url: Optional[str] = None):
        if default_base_url is None:
            default_base_url = os.getenv("BACKEND_URL", "http://127.0.0.1:8000")
        self.default_base_url = default_base_url.rstrip("/")

    def _normalize_url(self, endpoint: str) -> str:
        endpoint = endpoint.strip()
        if not endpoint:
            raise ValidationException("Endpoint URL cannot be empty.")
            
        if endpoint.startswith("http://") or endpoint.startswith("https://"):
            return endpoint
            
        # Treat as relative path
        if not endpoint.startswith("/"):
            endpoint = "/" + endpoint
        return f"{self.default_base_url}{endpoint}"

    def execute(
        self,
        endpoint: str,
        method: str,
        headers: Optional[Dict[str, str]] = None,
        payload: Optional[Any] = None,
        params: Optional[Dict[str, Any]] = None,
        timeout: int = 10,
        max_retries: int = 3,
        backoff_factor: float = 0.5
    ) -> Dict[str, Any]:
        """Executes an arbitrary HTTP call with validation, timeouts, and custom exponential backoff retries."""
        # 1. Validation
        method = str(method).upper().strip()
        if method not in SUPPORTED_METHODS:
            raise ValidationException(f"Unsupported HTTP method '{method}'. Supported: {SUPPORTED_METHODS}")

        url = self._normalize_url(endpoint)
        headers = headers or {}
        params = params or {}
        
        # Ensure json header is set if we have payload
        if payload is not None and "Content-Type" not in headers:
            headers["Content-Type"] = "application/json"

        # 2. Request execution with Retry Logic
        attempt = 0
        response = None
        start_time = time.time()

        while attempt <= max_retries:
            try:
                logger.info(f"action=execute_dynamic status=invoking endpoint={url} method={method} attempt={attempt}")
                t0 = time.time()
                
                # Make HTTP call
                if payload is not None and isinstance(payload, (dict, list)):
                    response = requests.request(
                        method=method,
                        url=url,
                        headers=headers,
                        json=payload,
                        params=params,
                        timeout=timeout
                    )
                else:
                    response = requests.request(
                        method=method,
                        url=url,
                        headers=headers,
                        data=payload,
                        params=params,
                        timeout=timeout
                    )

                elapsed_ms = (time.time() - t0) * 1000.0

                # Check if it is a transient server error (5xx)
                if response.status_code in {500, 502, 503, 504} and attempt < max_retries:
                    attempt += 1
                    delay = backoff_factor * (2 ** attempt)
                    logger.warning(f"action=execute_dynamic status=transient_error code={response.status_code} retrying_in={delay:.2f}s")
                    time.sleep(delay)
                    continue
                
                # Success or non-transient error
                break

            except requests.exceptions.Timeout as e:
                logger.error(f"action=execute_dynamic status=timeout error={str(e)} attempt={attempt}")
                if attempt < max_retries:
                    attempt += 1
                    delay = backoff_factor * (2 ** attempt)
                    time.sleep(delay)
                    continue
                raise ExecutionTimeoutException(f"Request execution timed out after {timeout} seconds: {str(e)}")

            except requests.exceptions.ConnectionError as e:
                logger.error(f"action=execute_dynamic status=connection_error error={str(e)} attempt={attempt}")
                if attempt < max_retries:
                    attempt += 1
                    delay = backoff_factor * (2 ** attempt)
                    time.sleep(delay)
                    continue
                raise ConnectionException(f"Transport connection failed: {str(e)}")

            except requests.exceptions.RequestException as e:
                logger.error(f"action=execute_dynamic status=request_error error={str(e)}")
                raise ConnectionException(f"API execution request failed: {str(e)}")

        total_duration_ms = (time.time() - start_time) * 1000.0

        if response is None:
            raise ConnectionException("API execution request returned empty response.")

        # 3. Structure Response
        content_type = response.headers.get("Content-Type", "")
        if "application/json" in content_type:
            try:
                res_payload = response.json()
            except ValueError:
                res_payload = response.text
        else:
            res_payload = response.text

        logger.info(
            f"action=execute_dynamic status=completed endpoint={url} method={method} "
            f"code={response.status_code} duration_ms={total_duration_ms:.2f} retries={attempt}"
        )

        return {
            "status_code": response.status_code,
            "headers": dict(response.headers),
            "payload": res_payload,
            "elapsed_ms": round(total_duration_ms, 2),
            "retries_attempted": attempt,
            "success": response.ok
        }
