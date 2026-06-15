class TeamcenterSessionError(Exception):
    """Base exception class for all Teamcenter Session errors."""

    pass


class TeamcenterAuthError(TeamcenterSessionError):
    """Raised when authentication with the Teamcenter server fails."""

    pass


class SessionExpiredError(TeamcenterSessionError):
    """Raised when a Teamcenter session has expired."""

    pass


class SessionNotFoundError(TeamcenterSessionError):
    """Raised when a requested session is not found in the registry."""

    pass
