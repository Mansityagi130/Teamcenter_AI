from datetime import datetime, timedelta
import logging
import threading
from typing import Dict, Optional
import requests
from .exceptions import TeamcenterAuthError, SessionNotFoundError
from .session import TeamcenterSession

logger = logging.getLogger("teamcenter.session_manager")


class TeamcenterSessionManager:
    """Enterprise authentication session manager for Teamcenter connection reuse."""

    def __init__(self, session_timeout_seconds: int = 3600):
        self.sessions: Dict[str, TeamcenterSession] = {}
        self.lock = threading.Lock()
        self.session_timeout_seconds = session_timeout_seconds

    def create_session(
        self, username: str, password: str, base_url: str
    ) -> TeamcenterSession:
        """Authenticates against Teamcenter and registers a new active session."""
        logger.info(f"Initiating Teamcenter login request for user: '{username}'")
        url = f"{base_url.rstrip('/')}/login"
        payload = {"username": username, "password": password}

        try:
            response = requests.post(url, json=payload, timeout=15)
            if not response.ok:
                logger.error(
                    f"Teamcenter authentication endpoint returned error {response.status_code}: {response.text}"
                )
                raise TeamcenterAuthError(
                    f"Authentication failed: status {response.status_code}"
                )

            # Extract cookies from response jar
            cookies = response.cookies.get_dict()

            # Attempt to extract XSRF tokens from response headers
            xsrf_token = response.headers.get("x-csrf-token") or response.headers.get(
                "x-xsrf-token"
            )

            # Fallback to response JSON payload fields (e.g. access_token or api_key)
            if not xsrf_token:
                try:
                    data = response.json()
                    xsrf_token = data.get("access_token") or data.get("api_key")
                except Exception:
                    pass

            # Ensure we have at least session credentials to hold session state
            if not cookies and xsrf_token:
                cookies["session_token"] = xsrf_token

            now = datetime.utcnow()
            expires_at = now + timedelta(seconds=self.session_timeout_seconds)

            session = TeamcenterSession(
                username=username,
                cookies=cookies,
                xsrf_token=xsrf_token,
                created_at=now,
                expires_at=expires_at,
            )

            with self.lock:
                self.sessions[username] = session

            logger.info(f"Teamcenter session created successfully for user '{username}'.")
            return session

        except requests.exceptions.RequestException as e:
            logger.error(
                f"Teamcenter connection failure during authentication: {str(e)}"
            )
            raise TeamcenterAuthError(f"Connection failed: {str(e)}")

    def get_session(self, username: str) -> Optional[TeamcenterSession]:
        """Retrieves an active session from the registry, automatically checking expiration."""
        with self.lock:
            session = self.sessions.get(username)

        if not session:
            return None

        # Expiration Check
        if session.is_expired():
            logger.info(
                f"Detected expired session for user '{username}'. Cleaning up registry."
            )
            self.remove_session(username)
            return None

        return session

    def get_or_create_session(
        self, username: str, password: str, base_url: str
    ) -> TeamcenterSession:
        """Reuses an active valid session, or creates a new refreshed session if needed."""
        session = self.get_session(username)

        if session:
            logger.info(f"Reusing existing valid session for user '{username}'.")
            return session

        # Automatic Refresh / Login
        logger.info(
            f"No valid session found for user '{username}'. Running login/refresh."
        )
        return self.create_session(username, password, base_url)

    def remove_session(self, username: str) -> None:
        """Terminates and purges the session for the specified username."""
        with self.lock:
            if username in self.sessions:
                del self.sessions[username]
                logger.info(f"Removed session for user '{username}' from registry.")
            else:
                raise SessionNotFoundError(f"Session for '{username}' not found.")

    def cleanup_expired_sessions(self) -> None:
        """Purges all expired sessions from the registry to release resources."""
        with self.lock:
            usernames = list(self.sessions.keys())

        expired_count = 0
        for username in usernames:
            session = self.sessions.get(username)
            if session and session.is_expired():
                self.remove_session(username)
                expired_count += 1

        if expired_count > 0:
            logger.info(
                f"Completed background cleanup: purged {expired_count} expired session(s)."
            )
        else:
            logger.debug("Background cleanup: no expired sessions found.")
