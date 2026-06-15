from datetime import datetime, timedelta
import unittest
from unittest.mock import patch, MagicMock
from teamcenter.session_manager import (
    TeamcenterSessionManager,
    TeamcenterSession,
    TeamcenterAuthError,
    SessionNotFoundError,
)


class TestTeamcenterSessionManager(unittest.TestCase):
    def setUp(self):
        # Configure manager with standard settings
        self.manager = TeamcenterSessionManager(session_timeout_seconds=60)
        self.username = "test_user"
        self.password = "secure_password"
        self.base_url = "http://localhost:8000"

    @patch("teamcenter.session_manager.manager.requests.post")
    def test_create_session_success_with_cookies_and_header_token(
        self, mock_post
    ):
        # Setup mock login response containing cookies and XSRF headers
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.status_code = 200

        # Simulate cookies
        mock_response.cookies.get_dict.return_value = {
            "JSESSIONID": "mock-jsession-id"
        }

        # Simulate headers containing CSRF token
        mock_response.headers = {"x-xsrf-token": "mock-xsrf-token"}

        mock_post.return_value = mock_response

        # Execute session creation
        session = self.manager.create_session(
            self.username, self.password, self.base_url
        )

        # Assertions
        self.assertIsNotNone(session)
        self.assertEqual(session.username, self.username)
        self.assertEqual(session.xsrf_token, "mock-xsrf-token")
        self.assertEqual(session.cookies["JSESSIONID"], "mock-jsession-id")
        self.assertFalse(session.is_expired())

        # Verify requests.Session is pre-configured with headers and cookies
        self.assertEqual(
            session.requests_session.cookies.get("JSESSIONID"),
            "mock-jsession-id",
        )
        self.assertEqual(
            session.requests_session.headers.get("X-XSRF-TOKEN"),
            "mock-xsrf-token",
        )

        # Verify correct user registry state
        registered_session = self.manager.get_session(self.username)
        self.assertEqual(registered_session, session)

    @patch("teamcenter.session_manager.manager.requests.post")
    def test_create_session_success_fallback_json_payload(self, mock_post):
        # Setup mock login response returning JWT payload in body
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.status_code = 200
        mock_response.cookies.get_dict.return_value = {}
        mock_response.headers = {}
        mock_response.json.return_value = {"access_token": "mock-jwt-token"}

        mock_post.return_value = mock_response

        # Execute
        session = self.manager.create_session(
            self.username, self.password, self.base_url
        )

        # Assert fallback token extraction
        self.assertEqual(session.xsrf_token, "mock-jwt-token")
        self.assertEqual(session.cookies["session_token"], "mock-jwt-token")

    @patch("teamcenter.session_manager.manager.requests.post")
    def test_create_session_failure(self, mock_post):
        # Setup failed login response
        mock_response = MagicMock()
        mock_response.ok = False
        mock_response.status_code = 401
        mock_response.text = "Invalid credentials"
        mock_post.return_value = mock_response

        # Assert authentication exception is raised
        with self.assertRaises(TeamcenterAuthError):
            self.manager.create_session(
                self.username, self.password, self.base_url
            )

    @patch("teamcenter.session_manager.manager.requests.post")
    def test_session_reuse(self, mock_post):
        # Setup successful login
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.status_code = 200
        mock_response.cookies.get_dict.return_value = {"JSESSIONID": "xyz"}
        mock_response.headers = {}
        mock_post.return_value = mock_response

        # First call creates session
        session_1 = self.manager.get_or_create_session(
            self.username, self.password, self.base_url
        )

        # Second call should reuse session
        session_2 = self.manager.get_or_create_session(
            self.username, self.password, self.base_url
        )

        # Assertions
        self.assertEqual(session_1, session_2)
        # Verify requests.post was only invoked once
        mock_post.assert_called_once()

    @patch("teamcenter.session_manager.manager.requests.post")
    def test_session_expiration_and_automatic_refresh(self, mock_post):
        # Setup successful login
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.status_code = 200
        mock_response.cookies.get_dict.return_value = {"JSESSIONID": "abc"}
        mock_response.headers = {}
        mock_post.return_value = mock_response

        # Create session
        session_1 = self.manager.get_or_create_session(
            self.username, self.password, self.base_url
        )

        # Force session expiration by shifting expires_at to past
        session_1.expires_at = datetime.utcnow() - timedelta(seconds=1)
        self.assertTrue(session_1.is_expired())

        # Calling get_or_create_session should trigger automatic refresh
        session_2 = self.manager.get_or_create_session(
            self.username, self.password, self.base_url
        )

        # Assertions
        self.assertNotEqual(session_1, session_2)
        # Verify requests.post was called twice (once for initial login, once for refresh)
        self.assertEqual(mock_post.call_count, 2)

    def test_session_removal(self):
        # Manually register mock session
        session = TeamcenterSession(
            username=self.username,
            cookies={"JSESSIONID": "abc"},
            xsrf_token=None,
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(seconds=60),
        )
        self.manager.sessions[self.username] = session

        # Explicit removal
        self.manager.remove_session(self.username)
        self.assertNotIn(self.username, self.manager.sessions)

        # Error raised on non-existing removal
        with self.assertRaises(SessionNotFoundError):
            self.manager.remove_session(self.username)

    def test_session_cleanup(self):
        now = datetime.utcnow()
        # Add active session
        active_user = "active_user"
        self.manager.sessions[active_user] = TeamcenterSession(
            username=active_user,
            cookies={},
            xsrf_token=None,
            created_at=now,
            expires_at=now + timedelta(seconds=60),
        )

        # Add expired session
        expired_user = "expired_user"
        self.manager.sessions[expired_user] = TeamcenterSession(
            username=expired_user,
            cookies={},
            xsrf_token=None,
            created_at=now - timedelta(seconds=120),
            expires_at=now - timedelta(seconds=60),
        )

        # Execute cleanup
        self.manager.cleanup_expired_sessions()

        # Assertions
        self.assertIn(active_user, self.manager.sessions)
        self.assertNotIn(expired_user, self.manager.sessions)


if __name__ == "__main__":
    unittest.main()
