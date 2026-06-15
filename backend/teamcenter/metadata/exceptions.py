class MetadataServiceException(Exception):
    """Base exception class for all Metadata Explorer errors."""
    pass


class ObjectTypeNotFoundException(MetadataServiceException):
    """Raised when the specified object type is invalid or unsupported."""
    pass


class SearchException(MetadataServiceException):
    """Raised when metadata search fails or contains invalid terms."""
    pass
