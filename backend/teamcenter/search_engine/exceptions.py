class SearchEngineException(Exception):
    """Base exception class for all Advanced Search Engine errors."""
    pass


class InvalidSearchFilterException(SearchEngineException):
    """Raised when an invalid filter parameter or data type is provided."""
    pass


class SearchExecutionException(SearchEngineException):
    """Raised when executing the search query fails on the database."""
    pass
