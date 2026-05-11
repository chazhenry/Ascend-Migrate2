from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class APIError(Exception):
    def __init__(self, detail: str, code: str, status_code: int = 400) -> None:
        self.detail = detail
        self.code = code
        self.status_code = status_code
        super().__init__(detail)


async def api_error_handler(_: Request, exc: APIError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail, "code": exc.code})


async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    first_error = exc.errors()[0] if exc.errors() else {"msg": "Invalid request."}
    return JSONResponse(
        status_code=422,
        content={"detail": str(first_error.get("msg", "Invalid request.")), "code": "validation_error"},
    )


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(APIError, api_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
