from datetime import UTC, datetime
import re
from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import CurrentUser, DBSession
from app.core.errors import APIError
from app.models.project import Project
from app.schemas.common import MessageResponse
from app.schemas.project import (
    ProjectCreateRequest,
    ProjectDetailResponse,
    ProjectListItemResponse,
    ProjectUpdateRequest,
)


router = APIRouter(prefix="/projects", tags=["projects"])


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "project"


async def _build_unique_slug(db: DBSession, name: str, desired_slug: str | None = None, project_id: UUID | None = None) -> str:
    base_slug = _slugify(desired_slug or name)
    slug = base_slug
    suffix = 2

    while True:
        result = await db.execute(select(Project).where(Project.slug == slug))
        existing = result.scalar_one_or_none()
        if existing is None or existing.id == project_id:
            return slug
        slug = f"{base_slug}-{suffix}"
        suffix += 1


async def _get_project_or_404(db: DBSession, project_id: UUID) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise APIError("Project not found.", "project_not_found", 404)
    return project


@router.get("", response_model=list[ProjectListItemResponse])
async def list_projects(_: CurrentUser, db: DBSession) -> list[ProjectListItemResponse]:
    result = await db.execute(
        select(Project)
        .where(Project.status != "archived")
        .order_by(Project.updated_at.desc())
    )
    return [ProjectListItemResponse.model_validate(item) for item in result.scalars().all()]


@router.post("", response_model=ProjectDetailResponse)
async def create_project(payload: ProjectCreateRequest, user: CurrentUser, db: DBSession) -> ProjectDetailResponse:
    project = Project(
        name=payload.name,
        slug=await _build_unique_slug(db, payload.name, payload.slug),
        status=payload.status or "active",
        config=payload.config,
        created_by=user.id,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return ProjectDetailResponse.model_validate(project)


@router.get("/{project_id}", response_model=ProjectDetailResponse)
async def get_project(project_id: UUID, _: CurrentUser, db: DBSession) -> ProjectDetailResponse:
    project = await _get_project_or_404(db, project_id)
    return ProjectDetailResponse.model_validate(project)


@router.patch("/{project_id}", response_model=ProjectDetailResponse)
async def update_project(
    project_id: UUID,
    payload: ProjectUpdateRequest,
    _: CurrentUser,
    db: DBSession,
) -> ProjectDetailResponse:
    project = await _get_project_or_404(db, project_id)
    values = payload.model_dump(exclude_unset=True)

    if "name" in values and values["name"] is not None:
        project.name = values["name"]

    if "slug" in values or "name" in values:
        project.slug = await _build_unique_slug(db, project.name, values.get("slug") or project.slug, project.id)

    if "status" in values and values["status"] is not None:
        project.status = values["status"]

    if "config" in values and values["config"] is not None:
        project.config = values["config"]

    project.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(project)
    return ProjectDetailResponse.model_validate(project)


@router.delete("/{project_id}", response_model=MessageResponse)
async def archive_project(project_id: UUID, _: CurrentUser, db: DBSession) -> MessageResponse:
    project = await _get_project_or_404(db, project_id)
    project.status = "archived"
    project.updated_at = datetime.now(UTC)
    await db.commit()
    return MessageResponse(detail="Project archived.", code="archived")