class DynamicExecutorException(Exception):
    """Base exception for all dynamic executor utility failures."""
    pass


class ValidationException(DynamicExecutorException):
    """Raised when request payload or parameters fail validation rules."""
    pass


class ConnectionException(DynamicExecutorException):
    """Raised when transport connection to the target endpoint fails."""
    pass


class ExecutionTimeoutException(DynamicExecutorException):
    """Raised when request execution times out."""
    pass
