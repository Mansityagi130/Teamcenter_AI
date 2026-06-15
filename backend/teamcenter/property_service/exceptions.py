class PropertyServiceException(Exception):
    """Base exception class for all Property Retrieval Service errors."""

    pass


class InvalidObjectTypeException(PropertyServiceException):
    """Raised when the specified object type is invalid or unsupported."""

    pass


class ObjectNotFoundException(PropertyServiceException):
    """Raised when the specified object ID cannot be found in Teamcenter."""

    pass


class PropertyNotFoundException(PropertyServiceException):
    """Raised when the specified property name is not valid for the object type."""

    pass
