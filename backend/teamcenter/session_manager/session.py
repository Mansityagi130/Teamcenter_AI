from datetime import datetime
import requests
from typing import Any, Dict, Optional


class TeamcenterSession:
    """Represents an active connection session to Teamcenter.

    Maintains cookie jars, XSRF tokens, and the underlying pre-configured HTTP session client.
    """

    def __init__(
        self,
        username: str,
        cookies: Dict[str, str],
        xsrf_token: Optional[str],
        created_at: datetime,
        expires_at: datetime,
        xsrf_header_name: str = "X-XSRF-TOKEN",
    ):
        self.username = username
        self.cookies = cookies
        self.xsrf_token = xsrf_token
        self.xsrf_header_name = xsrf_header_name
        self.created_at = created_at
        self.expires_at = expires_at

        # Configure reuseable HTTP client session
        self.requests_session = requests.Session()

        # Update cookies jar
        for k, v in cookies.items():
            self.requests_session.cookies.set(k, v)

        # Attach XSRF token header if present
        if xsrf_token:
            self.requests_session.headers.update({xsrf_header_name: xsrf_token})

    def is_expired(self) -> bool:
        """Determines if the session has reached its configured expiration time."""
        return datetime.utcnow() >= self.expires_at

    def to_dict(self) -> Dict[str, Any]:
        """Serializes session metadata (excluding raw credentials and clients) into dictionary format."""
        return {
            "username": self.username,
            "created_at": self.created_at.isoformat(),
            "expires_at": self.expires_at.isoformat(),
            "xsrf_token": self.xsrf_token,
            "xsrf_header_name": self.xsrf_header_name,
            "cookies": self.cookies,
        }
