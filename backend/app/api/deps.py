from typing import Annotated
from uuid import uuid4

from fastapi import Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db_session
from app.core.errors import APIError
from app.core.security import get_token_subject, hash_password
from app.models.user import User


bearer_scheme = HTTPBearer(auto_error=False)
DBSession = Annotated[AsyncSession, Depends(get_db_session)]
settings = get_settings()


def _build_ephemeral_dev_user() -> User:
    return User(
        id=uuid4(),
        email="dev@local.test",
        name="Dev User",
        password_hash="dev-mode-only",
        role="admin",
    )


async def _get_or_create_dev_user(db: DBSession) -> User:
    result = await db.execute(select(User).where(User.email == "dev@local.test"))
    user = result.scalar_one_or_none()
    if user is not None:
        return user

    user = User(
        email="dev@local.test",
        name="Dev User",
        password_hash=hash_password("dev-mode-only"),
        role="admin",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def get_db() -> AsyncSession:
    async for session in get_db_session():
        return session
    raise RuntimeError("Database session could not be created")


async def get_current_user(
    db: DBSession,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> User:
    if settings.dev_auth_bypass:
        try:
            return await _get_or_create_dev_user(db)
        except Exception:
            return _build_ephemeral_dev_user()
    if credentials is None:
        raise APIError("Authentication is required.", "auth_required", 401)
    try:
        user_id = get_token_subject(credentials.credentials)
    except ValueError as exc:
        raise APIError(str(exc), "invalid_token", 401) from exc

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise APIError("Authenticated user not found.", "user_not_found", 401)
    return user


async def get_current_user_or_token_query(
    db: DBSession,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    token: str | None = Query(default=None),
) -> User:
    if settings.dev_auth_bypass:
        try:
            return await _get_or_create_dev_user(db)
        except Exception:
            return _build_ephemeral_dev_user()
    token_value = credentials.credentials if credentials is not None else token
    if not token_value:
        raise APIError("Authentication is required.", "auth_required", 401)
    try:
        user_id = get_token_subject(token_value)
    except ValueError as exc:
        raise APIError(str(exc), "invalid_token", 401) from exc

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise APIError("Authenticated user not found.", "user_not_found", 401)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentUserOrQueryToken = Annotated[User, Depends(get_current_user_or_token_query)]
