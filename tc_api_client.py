import logging
import time
import requests
from urllib3.util import Retry
from requests.adapters import HTTPAdapter
from typing import Any, Dict, Union
from services.observability import get_db_connection, log_request
from services.demo import get_config, demo_match_response
from services import demo as demo_service

logger = logging.getLogger("tc_api_client")


class TeamcenterClient:
    """API client wrapper for invoking simulated Teamcenter REST endpoints dynamically.

    Handles connection pooling, auth headers, retries, and errors.
    """

    def __init__(self, base_url: str, api_key: str, jwt_token: str):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()

        # Set authentication headers
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["X-API-Key"] = api_key
        if jwt_token:
            headers["Authorization"] = f"Bearer {jwt_token}"

        self.session.headers.update(headers)

        # Setup retry strategy for transient 5xx errors
        retry_strategy = Retry(
            total=3,
            backoff_factor=0.5,
            status_forcelist=[500, 502, 503, 504],
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)

    def request(self, method: str, path: str, **kwargs) -> Union[Dict[str, Any], bytes]:
        """Dynamically sends an HTTP request to the target path.

        Handles success and failure outcomes cleanly.
        """
        url = f"{self.base_url}{path}"
        method = method.upper()
        start = time.perf_counter()
        status_code = 500
        error_message = None
        result = None

        cfg = demo_service.get_config()
        if cfg.demo_mode:
            logger.info(f"Teamcenter DEMO Client Request (mocked): {method} {path}")
            try:
                payload = kwargs.get("json")
                mock = demo_match_response(method, path, payload)
                if isinstance(mock, dict) and mock.get("code"):
                    status_code = mock.get("code")
                    error_message = mock.get("message")
                else:
                    status_code = 200
                return mock
            except Exception as e:
                error_message = str(e)
                result = {"status": "error", "message": f"Demo mock exception: {error_message}"}
                return result

        # Live request path
        try:
            logger.info(f"Teamcenter API Client Request: {method} {url}")
            response = self.session.request(method, url, **kwargs)
            status_code = response.status_code

            if not response.ok:
                error_message = response.text or "Request failed"
                logger.error(f"Teamcenter API request failed with status {status_code}: {error_message}")
                result = {"status": "error", "code": status_code, "message": error_message}
                return result

            content_type = response.headers.get("Content-Type", "")
            if "application/json" in content_type:
                result = response.json()
            else:
                result = response.content
            return result

        except requests.exceptions.RequestException as e:
            error_message = str(e)
            logger.error(f"Teamcenter API transport exception: {error_message}")
            result = {"status": "error", "message": f"Connection exception: {error_message}"}
            return result

        finally:
            duration_ms = (time.perf_counter() - start) * 1000.0
            try:
                with get_db_connection() as conn:
                    log_request(
                        conn,
                        None,
                        method,
                        path,
                        status_code,
                        duration_ms,
                        error_message=error_message,
                        service="teamcenter",
                    )
            except Exception:
                pass
