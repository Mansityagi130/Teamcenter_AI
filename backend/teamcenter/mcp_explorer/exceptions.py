class McpExplorerException(Exception):
    """Base exception for all MCP Explorer operations."""
    pass


class ToolNotFoundException(McpExplorerException):
    """Raised when a requested tool does not exist on the MCP server."""
    pass


class ToolExecutionException(McpExplorerException):
    """Raised when execution of an MCP tool fails."""
    pass


class UnauthorizedAdminException(McpExplorerException):
    """Raised when a non-admin tries to access MCP admin features."""
    pass
