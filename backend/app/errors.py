"""Application errors that can be mapped to HTTP without inspecting strings."""


class NotFoundError(ValueError):
    pass


class ConflictError(ValueError):
    pass
