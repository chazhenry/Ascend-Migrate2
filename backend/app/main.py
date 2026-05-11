from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse
from sqlalchemy import select

from app.api.routes import acquisitions, artifacts, auth, files, jobs, llm, projects, research, stages
from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.core.errors import register_error_handlers
from app.core.security import hash_password
from app.models.user import User


settings = get_settings()
SWAGGER_FAVICON_URL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ctext y='0.9em' font-size='56'%3E%F0%9F%9B%A2%EF%B8%8F%3C/text%3E%3C/svg%3E"
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(User).limit(1))
            if result.scalar_one_or_none() is None:
                session.add(
                    User(
                        email="admin@example.com",
                        name="Project Migrate Admin",
                        password_hash=hash_password("ChangeMe123!"),
                        role="admin",
                    )
                )
                await session.commit()
    except Exception as exc:
        logger.warning("Database unavailable during startup; continuing without bootstrap seed. %s", exc)
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
app.include_router(acquisitions.router, prefix=settings.api_v1_prefix)
app.include_router(files.router, prefix=settings.api_v1_prefix)
app.include_router(llm.router, prefix=settings.api_v1_prefix)
app.include_router(stages.router, prefix=settings.api_v1_prefix)
app.include_router(jobs.router, prefix=settings.api_v1_prefix)
app.include_router(artifacts.router, prefix=settings.api_v1_prefix)
app.include_router(research.router, prefix=settings.api_v1_prefix)


@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui_html() -> HTMLResponse:
    return get_swagger_ui_html(
        openapi_url=app.openapi_url or "/openapi.json",
        title=f"{settings.app_name} - Swagger UI",
        swagger_favicon_url=SWAGGER_FAVICON_URL,
    )


@app.get("/health")
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
