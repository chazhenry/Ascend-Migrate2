from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.core.errors import APIError
from app.core.security import create_access_token, verify_password
from app.models.user import User
from app.schemas.auth import AuthResponse, LoginRequest, UserResponse
from app.schemas.common import MessageResponse


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, db: DBSession) -> AuthResponse:
    result = await db.execute(select(User).where(User.email == payload.email.lower()))
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        raise APIError("Invalid email or password.", "invalid_credentials", 401)
    token = create_access_token(user.id)
    return AuthResponse(access_token=token, user=UserResponse.model_validate(user))


@router.post("/logout", response_model=MessageResponse)
async def logout(_: CurrentUser) -> MessageResponse:
    return MessageResponse(detail="Logout acknowledged.", code="logout_acknowledged")


@router.get("/me", response_model=UserResponse)
async def me(user: CurrentUser) -> UserResponse:
    return UserResponse.model_validate(user)
