from pydantic import BaseModel, ConfigDict, EmailStr

from app.schemas.common import ORMModel


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(ORMModel):
    id: str
    email: EmailStr
    name: str
    role: str


class AuthResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    access_token: str
    token_type: str = "bearer"
    user: UserResponse
