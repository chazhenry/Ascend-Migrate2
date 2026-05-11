from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ProjectBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=1, max_length=255)
    status: str | None = None
    config: dict[str, Any] = Field(default_factory=dict)


class ProjectCreateRequest(ProjectBase):
    pass


class ProjectUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=1, max_length=255)
    status: str | None = None
    config: dict[str, Any] | None = None


class ProjectListItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str
    status: str
    created_by: str
    created_at: datetime
    updated_at: datetime


class ProjectDetailResponse(ProjectListItemResponse):
    config: dict[str, Any]


class HeuristicsTextRequest(BaseModel):
    content: str


class SqlTemplateResponse(BaseModel):
    name: str
    content: str