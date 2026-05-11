import json
from datetime import UTC, datetime
import re
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import CurrentUser, DBSession
from app.core.config import get_settings
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
settings = get_settings()


def _dev_project_file() -> Path:
    return settings.generated_dir / "dev_projects.json"


def _serialize_project_rows(projects: list[dict[str, Any]]) -> None:
    file_path = _dev_project_file()
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(json.dumps(projects, indent=2), encoding="utf-8")


def _load_dev_projects() -> list[dict[str, Any]]:
    file_path = _dev_project_file()
    if not file_path.exists():
        return []
    try:
        data = json.loads(file_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    return data if isinstance(data, list) else []


def _build_unique_slug_for_rows(rows: list[dict[str, Any]], name: str, desired_slug: str | None = None, project_id: str | None = None) -> str:
    base_slug = _slugify(desired_slug or name)
    slug = base_slug
    suffix = 2

    while True:
        existing = next((item for item in rows if item.get("slug") == slug and item.get("id") != project_id), None)
        if existing is None:
            return slug
        slug = f"{base_slug}-{suffix}"
        suffix += 1


def _fallback_enabled() -> bool:
    return settings.dev_auth_bypass


def _list_fallback_projects() -> list[ProjectListItemResponse]:
    rows = [row for row in _load_dev_projects() if row.get("status") != "archived"]
    rows.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
    return [ProjectListItemResponse.model_validate(row) for row in rows]


def _create_fallback_project(payload: ProjectCreateRequest, user_id: str) -> ProjectDetailResponse:
    rows = _load_dev_projects()
    now = datetime.now(UTC).isoformat()
    project = {
        "id": str(uuid4()),
        "name": payload.name,
        "slug": _build_unique_slug_for_rows(rows, payload.name, payload.slug),
        "status": payload.status or "active",
        "config": payload.config,
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
    }
    rows.append(project)
    _serialize_project_rows(rows)
    return ProjectDetailResponse.model_validate(project)


def _get_fallback_project(project_id: UUID) -> ProjectDetailResponse:
    rows = _load_dev_projects()
    project = next((row for row in rows if row.get("id") == str(project_id)), None)
    if project is None:
        raise APIError("Project not found.", "project_not_found", 404)
    return ProjectDetailResponse.model_validate(project)


def _update_fallback_project(project_id: UUID, payload: ProjectUpdateRequest) -> ProjectDetailResponse:
    rows = _load_dev_projects()
    project = next((row for row in rows if row.get("id") == str(project_id)), None)
    if project is None:
        raise APIError("Project not found.", "project_not_found", 404)

    values = payload.model_dump(exclude_unset=True)
    if values.get("name") is not None:
        project["name"] = values["name"]
    if "slug" in values or "name" in values:
        project["slug"] = _build_unique_slug_for_rows(rows, project["name"], values.get("slug") or project.get("slug"), str(project_id))
    if values.get("status") is not None:
        project["status"] = values["status"]
    if values.get("config") is not None:
        project["config"] = values["config"]
    project["updated_at"] = datetime.now(UTC).isoformat()
    _serialize_project_rows(rows)
    return ProjectDetailResponse.model_validate(project)


def _archive_fallback_project(project_id: UUID) -> MessageResponse:
    rows = _load_dev_projects()
    project = next((row for row in rows if row.get("id") == str(project_id)), None)
    if project is None:
        raise APIError("Project not found.", "project_not_found", 404)
    project["status"] = "archived"
    project["updated_at"] = datetime.now(UTC).isoformat()
    _serialize_project_rows(rows)
    return MessageResponse(detail="Project archived.", code="archived")


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
    try:
        result = await db.execute(
            select(Project)
            .where(Project.status != "archived")
            .order_by(Project.updated_at.desc())
        )
        return [ProjectListItemResponse.model_validate(item) for item in result.scalars().all()]
    except APIError:
        raise
    except Exception:
        if _fallback_enabled():
            return _list_fallback_projects()
        raise


@router.post("", response_model=ProjectDetailResponse)
async def create_project(payload: ProjectCreateRequest, user: CurrentUser, db: DBSession) -> ProjectDetailResponse:
    try:
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
    except APIError:
        raise
    except Exception:
        if _fallback_enabled():
            return _create_fallback_project(payload, str(user.id))
        raise


@router.get("/{project_id}", response_model=ProjectDetailResponse)
async def get_project(project_id: UUID, _: CurrentUser, db: DBSession) -> ProjectDetailResponse:
    try:
        project = await _get_project_or_404(db, project_id)
        return ProjectDetailResponse.model_validate(project)
    except APIError:
        raise
    except Exception:
        if _fallback_enabled():
            return _get_fallback_project(project_id)
        raise


@router.patch("/{project_id}", response_model=ProjectDetailResponse)
async def update_project(
    project_id: UUID,
    payload: ProjectUpdateRequest,
    _: CurrentUser,
    db: DBSession,
) -> ProjectDetailResponse:
    try:
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
    except APIError:
        raise
    except Exception:
        if _fallback_enabled():
            return _update_fallback_project(project_id, payload)
        raise


@router.delete("/{project_id}", response_model=MessageResponse)
async def archive_project(project_id: UUID, _: CurrentUser, db: DBSession) -> MessageResponse:
    try:
        project = await _get_project_or_404(db, project_id)
        project.status = "archived"
        project.updated_at = datetime.now(UTC)
        await db.commit()
        return MessageResponse(detail="Project archived.", code="archived")
    except APIError:
        raise
    except Exception:
        if _fallback_enabled():
            return _archive_fallback_project(project_id)
        raise