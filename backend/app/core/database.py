import importlib.util
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()


def _resolve_async_database_url(database_url: str) -> str:
    if "+asyncpg" in database_url and importlib.util.find_spec("asyncpg") is None:
        return database_url.replace("+asyncpg", "+psycopg")
    return database_url


engine = create_async_engine(_resolve_async_database_url(settings.database_url), future=True, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
