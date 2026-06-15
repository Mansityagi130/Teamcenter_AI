class HealthMonitoringException(Exception):
    """Base exception class for health monitoring subsystem."""
    pass


class DiagnosticsFailureException(HealthMonitoringException):
    """Raised when running diagnostics checks fails."""
    pass
