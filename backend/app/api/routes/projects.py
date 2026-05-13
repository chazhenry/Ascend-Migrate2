import json
from datetime import UTC, datetime
import re
from pathlib import Path
from typing import Any

from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import CurrentUser, DBSession
from app.core.config import get_settings
from app.core.errors import APIError
from app.models.project import Project
from app.schemas.common import MessageResponse
from app.schemas.project import ProjectCreateRequest, ProjectDetailResponse, ProjectListItemResponse, ProjectUpdateRequest


router = APIRouter(prefix="/projects", tags=["projects"])
settings = get_settings()

PROJECT_STATUS_DEFAULT = "draft"
PROJECT_SOURCE_SYSTEM_DEFAULT = "Practice Engine"
PROJECT_DESTINATION_SYSTEM_DEFAULT = "CCH Axcess Practice"
PROJECT_FIRM_OFFICE_COUNT_DEFAULT = 1
PROJECT_CURRENT_STEP_DEFAULT = 0
PROJECT_CYCLE_DEFAULT = 1


def _dev_project_file() -> Path:
    return settings.generated_dir / "dev_projects.json"


def _project_config_dir() -> Path:
    return settings.generated_dir / "project_configs"


def _safe_project_key(project_slug: str) -> str:
    normalized = project_slug.strip().lower()
    if not re.fullmatch(r"[a-z0-9][a-z0-9\-]{0,79}", normalized):
        raise APIError("Invalid project slug.", "invalid_project_slug", 400)
    return normalized


def _project_config_path(project_slug: str) -> Path:
    return _project_config_dir() / f"{_safe_project_key(project_slug)}.json"


def _load_project_config(project_slug: str) -> dict[str, Any]:
    file_path = _project_config_path(project_slug)
    if not file_path.exists():
        return {}
    try:
        data = json.loads(file_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _write_project_config(project_slug: str, config: dict[str, Any]) -> None:
    file_path = _project_config_path(project_slug)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(json.dumps(config, indent=2), encoding="utf-8")


def _delete_project_config(project_slug: str) -> None:
    file_path = _project_config_path(project_slug)
    if file_path.exists():
        file_path.unlink()


def _rename_project_config(old_slug: str, new_slug: str) -> None:
    old_path = _project_config_path(old_slug)
    new_path = _project_config_path(new_slug)
    if not old_path.exists() or old_path == new_path:
        return
    new_path.parent.mkdir(parents=True, exist_ok=True)
    old_path.replace(new_path)


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


def _payload_project_name(payload: ProjectCreateRequest | ProjectUpdateRequest, fallback_name: str | None = None) -> str:
    return payload.display_name or payload.name or fallback_name or "Project"


def _payload_project_slug(payload: ProjectCreateRequest | ProjectUpdateRequest, fallback_slug: str | None = None) -> str | None:
    return payload.project_slug or payload.slug or fallback_slug


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "project"


def _normalize_schema_path(path_value: str | None) -> str | None:
    if not path_value:
        return None
    normalized = path_value.strip().replace("\\", "/")
    return normalized or None


def _project_response_dict(project: Project, config: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": project.project_slug,
        "name": project.display_name,
        "slug": project.project_slug,
        "display_name": project.display_name,
        "project_slug": project.project_slug,
        "firm_name": project.firm_name,
        "firm_revenue": float(project.firm_revenue) if project.firm_revenue is not None else None,
        "firm_staff_count": project.firm_staff_count,
        "firm_office_count": project.firm_office_count,
        "source_system": project.source_system,
        "source_db_platform": project.source_db_platform,
        "databricks_handle": project.databricks_handle,
        "source_connection": project.source_connection,
        "destination_system": project.destination_system,
        "dau_instance_id": project.dau_instance_id,
        "status": project.status,
        "current_step": project.current_step,
        "wf_template_code": project.wf_template_code,
        "entities_in_scope": project.entities_in_scope or [],
        "enriched_schema_path_cch": project.enriched_schema_path_cch,
        "enriched_schema_path_client": project.enriched_schema_path_client,
        "cycle": project.cycle,
        "ct_lead": project.ct_lead,
        "ascend_contacts": project.ascend_contacts or [],
        "known_risks": project.known_risks or [],
        "notes": project.notes,
        "created_by": project.created_by,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
        "config": config,
    }


def _build_project_response(project: Project) -> ProjectDetailResponse:
    return ProjectDetailResponse.model_validate(_project_response_dict(project, _load_project_config(project.project_slug)))


def _fallback_enabled() -> bool:
    return settings.dev_auth_bypass


def _build_unique_slug_for_rows(rows: list[dict[str, Any]], display_name: str, desired_slug: str | None = None, current_slug: str | None = None) -> str:
    base_slug = _slugify(desired_slug or display_name)
    slug = base_slug
    suffix = 2
    while True:
        existing = next((item for item in rows if item.get("project_slug") == slug and item.get("project_slug") != current_slug), None)
        if existing is None:
            return slug
        slug = f"{base_slug}-{suffix}"
        suffix += 1


def _fallback_project_response(row: dict[str, Any]) -> ProjectDetailResponse:
    return ProjectDetailResponse.model_validate({
        "id": row["project_slug"],
        "name": row["display_name"],
        "slug": row["project_slug"],
        "display_name": row["display_name"],
        "project_slug": row["project_slug"],
        "firm_name": row["firm_name"],
        "firm_revenue": row.get("firm_revenue"),
        "firm_staff_count": row.get("firm_staff_count"),
        "firm_office_count": row.get("firm_office_count"),
        "source_system": row.get("source_system") or PROJECT_SOURCE_SYSTEM_DEFAULT,
        "source_db_platform": row.get("source_db_platform"),
        "databricks_handle": row.get("databricks_handle"),
        "source_connection": row.get("source_connection"),
        "destination_system": row.get("destination_system") or PROJECT_DESTINATION_SYSTEM_DEFAULT,
        "dau_instance_id": row.get("dau_instance_id"),
        "status": row.get("status") or PROJECT_STATUS_DEFAULT,
        "current_step": row.get("current_step"),
        "wf_template_code": row.get("wf_template_code"),
        "entities_in_scope": row.get("entities_in_scope") or [],
        "enriched_schema_path_cch": row.get("enriched_schema_path_cch"),
        "enriched_schema_path_client": row.get("enriched_schema_path_client"),
        "cycle": row.get("cycle"),
        "ct_lead": row.get("ct_lead"),
        "ascend_contacts": row.get("ascend_contacts") or [],
        "known_risks": row.get("known_risks") or [],
        "notes": row.get("notes"),
        "created_by": row.get("created_by"),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "config": row.get("config") or {},
    })


def _list_fallback_projects() -> list[ProjectListItemResponse]:
    rows = [row for row in _load_dev_projects() if row.get("status") != "archived"]
    rows.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
    return [ProjectListItemResponse.model_validate(_fallback_project_response(row).model_dump()) for row in rows]


def _create_fallback_project(payload: ProjectCreateRequest, user_id: str) -> ProjectDetailResponse:
    rows = _load_dev_projects()
    now = datetime.now(UTC).isoformat()
    display_name = _payload_project_name(payload)
    project_slug = _build_unique_slug_for_rows(rows, display_name, _payload_project_slug(payload))
    config = dict(payload.config)
    project = {
        "display_name": display_name,
        "project_slug": project_slug,
        "firm_name": payload.firm_name,
        "firm_revenue": payload.firm_revenue,
        "firm_staff_count": payload.firm_staff_count,
        "firm_office_count": payload.firm_office_count or PROJECT_FIRM_OFFICE_COUNT_DEFAULT,
        "source_system": payload.source_system or PROJECT_SOURCE_SYSTEM_DEFAULT,
        "source_db_platform": payload.source_db_platform,
        "databricks_handle": payload.databricks_handle,
        "source_connection": payload.source_connection,
        "destination_system": payload.destination_system or PROJECT_DESTINATION_SYSTEM_DEFAULT,
        "dau_instance_id": payload.dau_instance_id,
        "status": payload.status or PROJECT_STATUS_DEFAULT,
        "current_step": payload.current_step if payload.current_step is not None else PROJECT_CURRENT_STEP_DEFAULT,
        "wf_template_code": payload.wf_template_code,
        "entities_in_scope": payload.entities_in_scope,
        "enriched_schema_path_cch": _normalize_schema_path(payload.enriched_schema_path_cch),
        "enriched_schema_path_client": _normalize_schema_path(payload.enriched_schema_path_client),
        "cycle": payload.cycle if payload.cycle is not None else PROJECT_CYCLE_DEFAULT,
        "ct_lead": payload.ct_lead,
        "ascend_contacts": payload.ascend_contacts,
        "known_risks": payload.known_risks,
        "notes": payload.notes,
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
        "config": config,
    }
    rows.append(project)
    _serialize_project_rows(rows)
    return _fallback_project_response(project)


def _get_fallback_project(project_slug: str) -> ProjectDetailResponse:
    slug = _safe_project_key(project_slug)
    row = next((item for item in _load_dev_projects() if item.get("project_slug") == slug), None)
    if row is None:
        raise APIError("Project not found.", "project_not_found", 404)
    return _fallback_project_response(row)


def _update_fallback_project(project_slug: str, payload: ProjectUpdateRequest) -> ProjectDetailResponse:
    slug = _safe_project_key(project_slug)
    rows = _load_dev_projects()
    row = next((item for item in rows if item.get("project_slug") == slug), None)
    if row is None:
        raise APIError("Project not found.", "project_not_found", 404)

    values = payload.model_dump(exclude_unset=True)
    next_slug = slug
    if "project_slug" in values or "slug" in values or "display_name" in values or "name" in values:
        next_slug = _build_unique_slug_for_rows(rows, _payload_project_name(payload, row["display_name"]), _payload_project_slug(payload, slug), slug)

    row["display_name"] = values.get("display_name") or values.get("name") or row["display_name"]
    row["project_slug"] = next_slug
    row["firm_name"] = values.get("firm_name", row["firm_name"])
    row["firm_revenue"] = values.get("firm_revenue", row.get("firm_revenue"))
    row["firm_staff_count"] = values.get("firm_staff_count", row.get("firm_staff_count"))
    row["firm_office_count"] = values.get("firm_office_count", row.get("firm_office_count"))
    row["source_system"] = values.get("source_system", row.get("source_system"))
    row["source_db_platform"] = values.get("source_db_platform", row.get("source_db_platform"))
    row["databricks_handle"] = values.get("databricks_handle", row.get("databricks_handle"))
    row["source_connection"] = values.get("source_connection", row.get("source_connection"))
    row["destination_system"] = values.get("destination_system", row.get("destination_system"))
    row["dau_instance_id"] = values.get("dau_instance_id", row.get("dau_instance_id"))
    row["status"] = values.get("status", row.get("status"))
    row["current_step"] = values.get("current_step", row.get("current_step"))
    row["wf_template_code"] = values.get("wf_template_code", row.get("wf_template_code"))
    row["entities_in_scope"] = values.get("entities_in_scope", row.get("entities_in_scope"))
    row["enriched_schema_path_cch"] = _normalize_schema_path(values.get("enriched_schema_path_cch", row.get("enriched_schema_path_cch")))
    row["enriched_schema_path_client"] = _normalize_schema_path(values.get("enriched_schema_path_client", row.get("enriched_schema_path_client")))
    row["cycle"] = values.get("cycle", row.get("cycle"))
    row["ct_lead"] = values.get("ct_lead", row.get("ct_lead"))
    row["ascend_contacts"] = values.get("ascend_contacts", row.get("ascend_contacts"))
    row["known_risks"] = values.get("known_risks", row.get("known_risks"))
    row["notes"] = values.get("notes", row.get("notes"))
    if values.get("config") is not None:
        row["config"] = dict(values["config"])
    row["updated_at"] = datetime.now(UTC).isoformat()
    _serialize_project_rows(rows)
    if slug != next_slug:
        _rename_project_config(slug, next_slug)
    return _fallback_project_response(row)


def _archive_fallback_project(project_slug: str) -> MessageResponse:
    slug = _safe_project_key(project_slug)
    rows = _load_dev_projects()
    row = next((item for item in rows if item.get("project_slug") == slug), None)
    if row is None:
        raise APIError("Project not found.", "project_not_found", 404)
    row["status"] = "archived"
    row["updated_at"] = datetime.now(UTC).isoformat()
    _serialize_project_rows(rows)
    return MessageResponse(detail="Project archived.", code="archived")


async def _build_unique_slug(db: DBSession, display_name: str, desired_slug: str | None = None, current_slug: str | None = None) -> str:
    base_slug = _slugify(desired_slug or display_name)
    slug = base_slug
    suffix = 2
    while True:
        result = await db.execute(select(Project).where(Project.project_slug == slug))
        existing = result.scalar_one_or_none()
        if existing is None or existing.project_slug == current_slug:
            return slug
        slug = f"{base_slug}-{suffix}"
        suffix += 1


async def _get_project_or_404(db: DBSession, project_slug: str) -> Project:
    slug = _safe_project_key(project_slug)
    result = await db.execute(select(Project).where(Project.project_slug == slug))
    project = result.scalar_one_or_none()
    if project is None:
        raise APIError("Project not found.", "project_not_found", 404)
    return project


@router.get("", response_model=list[ProjectListItemResponse])
async def list_projects(_: CurrentUser, db: DBSession) -> list[ProjectListItemResponse]:
    try:
        result = await db.execute(select(Project).order_by(Project.updated_at.desc()))
        return [
            ProjectListItemResponse.model_validate(_build_project_response(project).model_dump())
            for project in result.scalars().all()
            if project.status != "archived"
        ]
    except APIError:
        raise
    except Exception as exc:
        if _fallback_enabled():
            fallback_projects = _list_fallback_projects()
            if fallback_projects:
                return fallback_projects
            raise APIError(
                f"Projects database unavailable and no fallback projects exist. {exc}",
                "projects_unavailable",
                503,
            )
        raise


@router.post("", response_model=ProjectDetailResponse)
async def create_project(payload: ProjectCreateRequest, user: CurrentUser, db: DBSession) -> ProjectDetailResponse:
    try:
        display_name = _payload_project_name(payload)
        resolved_slug = await _build_unique_slug(db, display_name, _payload_project_slug(payload))
        project = Project(
            display_name=display_name,
            project_slug=resolved_slug,
            firm_name=payload.firm_name,
            firm_revenue=payload.firm_revenue,
            firm_staff_count=payload.firm_staff_count,
            firm_office_count=payload.firm_office_count or PROJECT_FIRM_OFFICE_COUNT_DEFAULT,
            source_system=payload.source_system or PROJECT_SOURCE_SYSTEM_DEFAULT,
            source_db_platform=payload.source_db_platform,
            databricks_handle=payload.databricks_handle,
            source_connection=payload.source_connection,
            destination_system=payload.destination_system or PROJECT_DESTINATION_SYSTEM_DEFAULT,
            dau_instance_id=payload.dau_instance_id,
            status=payload.status or PROJECT_STATUS_DEFAULT,
            current_step=payload.current_step if payload.current_step is not None else PROJECT_CURRENT_STEP_DEFAULT,
            wf_template_code=payload.wf_template_code,
            entities_in_scope=payload.entities_in_scope,
            enriched_schema_path_cch=_normalize_schema_path(payload.enriched_schema_path_cch),
            enriched_schema_path_client=_normalize_schema_path(payload.enriched_schema_path_client),
            cycle=payload.cycle if payload.cycle is not None else PROJECT_CYCLE_DEFAULT,
            ct_lead=payload.ct_lead,
            ascend_contacts=payload.ascend_contacts,
            known_risks=payload.known_risks,
            notes=payload.notes,
            created_by=getattr(user, "email", None) or str(getattr(user, "id", "")) or None,
        )
        db.add(project)
        await db.commit()
        await db.refresh(project)
        _write_project_config(project.project_slug, dict(payload.config))
        return _build_project_response(project)
    except APIError:
        raise
    except Exception:
        if _fallback_enabled():
            return _create_fallback_project(payload, getattr(user, "email", None) or str(getattr(user, "id", "")))
        raise


@router.get("/{project_id}", response_model=ProjectDetailResponse)
async def get_project(project_id: str, _: CurrentUser, db: DBSession) -> ProjectDetailResponse:
    try:
        project = await _get_project_or_404(db, project_id)
        return _build_project_response(project)
    except APIError:
        raise
    except Exception:
        if _fallback_enabled():
            return _get_fallback_project(project_id)
        raise


@router.patch("/{project_id}", response_model=ProjectDetailResponse)
async def update_project(project_id: str, payload: ProjectUpdateRequest, _: CurrentUser, db: DBSession) -> ProjectDetailResponse:
    try:
        project = await _get_project_or_404(db, project_id)
        values = payload.model_dump(exclude_unset=True)
        old_slug = project.project_slug
        if "project_slug" in values or "slug" in values or "display_name" in values or "name" in values:
            project.project_slug = await _build_unique_slug(db, _payload_project_name(payload, project.display_name), _payload_project_slug(payload, project.project_slug), project.project_slug)

        project.display_name = values.get("display_name") or values.get("name") or project.display_name
        if "firm_name" in values:
            project.firm_name = values["firm_name"]
        if "firm_revenue" in values:
            project.firm_revenue = values["firm_revenue"]
        if "firm_staff_count" in values:
            project.firm_staff_count = values["firm_staff_count"]
        if "firm_office_count" in values:
            project.firm_office_count = values["firm_office_count"]
        if "source_system" in values:
            project.source_system = values["source_system"]
        if "source_db_platform" in values:
            project.source_db_platform = values["source_db_platform"]
        if "databricks_handle" in values:
            project.databricks_handle = values["databricks_handle"]
        if "source_connection" in values:
            project.source_connection = values["source_connection"]
        if "destination_system" in values:
            project.destination_system = values["destination_system"]
        if "dau_instance_id" in values:
            project.dau_instance_id = values["dau_instance_id"]
        if "status" in values:
            project.status = values["status"]
        if "current_step" in values:
            project.current_step = values["current_step"]
        if "wf_template_code" in values:
            project.wf_template_code = values["wf_template_code"]
        if "entities_in_scope" in values:
            project.entities_in_scope = values["entities_in_scope"]
        if "enriched_schema_path_cch" in values:
            project.enriched_schema_path_cch = _normalize_schema_path(values["enriched_schema_path_cch"])
        if "enriched_schema_path_client" in values:
            project.enriched_schema_path_client = _normalize_schema_path(values["enriched_schema_path_client"])
        if "cycle" in values:
            project.cycle = values["cycle"]
        if "ct_lead" in values:
            project.ct_lead = values["ct_lead"]
        if "ascend_contacts" in values:
            project.ascend_contacts = values["ascend_contacts"]
        if "known_risks" in values:
            project.known_risks = values["known_risks"]
        if "notes" in values:
            project.notes = values["notes"]
        project.updated_at = datetime.now(UTC)

        await db.commit()
        await db.refresh(project)

        if old_slug != project.project_slug:
            _rename_project_config(old_slug, project.project_slug)
        if "config" in values and values["config"] is not None:
            _write_project_config(project.project_slug, dict(values["config"]))

        return _build_project_response(project)
    except APIError:
        raise
    except Exception:
        if _fallback_enabled():
            return _update_fallback_project(project_id, payload)
        raise


@router.delete("/{project_id}", response_model=MessageResponse)
async def archive_project(project_id: str, _: CurrentUser, db: DBSession) -> MessageResponse:
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