from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse

from app.api.routes import auth, files, llm, pfx_server, projects
from app.core.config import get_settings
from app.core.errors import register_error_handlers


settings = get_settings()
SWAGGER_FAVICON_URL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ctext y='0.9em' font-size='56'%3E%F0%9F%9B%A2%EF%B8%8F%3C/text%3E%3C/svg%3E"


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan, docs_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
register_error_handlers(app)

app.include_router(auth.router, prefix=settings.api_v1_prefix)
app.include_router(projects.router, prefix=settings.api_v1_prefix)
app.include_router(files.router, prefix=settings.api_v1_prefix)
app.include_router(llm.router, prefix=settings.api_v1_prefix)
app.include_router(pfx_server.router, prefix=settings.api_v1_prefix)


@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui_html() -> HTMLResponse:
    return get_swagger_ui_html(
        openapi_url=app.openapi_url or "/openapi.json",
        title=f"{settings.app_name} - Swagger UI",
        swagger_favicon_url=SWAGGER_FAVICON_URL,
        swagger_ui_parameters={"docExpansion": "none"},
    )


@app.get("/health")
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
