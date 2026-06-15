class CatalogException(Exception):
    """Base exception class for all API Catalog errors."""
    pass


class EndpointNotFoundException(CatalogException):
    """Raised when the requested endpoint is not registered in the catalog."""
    pass
