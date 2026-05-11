from pathlib import Path
import re
from uuid import UUID

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import select

from app.api.deps import CurrentUser, DBSession
from app.core.config import get_settings
from app.core.errors import APIError
from app.models.acquisition import Acquisition
from app.models.acquisition_file import AcquisitionFile
from app.schemas.file import AcquisitionFileResponse
from app.schemas.common import MessageResponse
from app.schemas.project import HeuristicsTextRequest, SqlTemplateResponse
from app.services.schema_utils import group_schema_records, normalize_schema_payload
from app.services.stage_2_enrich import enrich_grouped_schema
from app.services.storage import save_upload
import json


router = APIRouter(tags=["files"])
settings = get_settings()


@router.post("/acquisitions/{acquisition_id}/files", response_model=list[AcquisitionFileResponse])
async def upload_files(
    acquisition_id: UUID,
    _: CurrentUser,
    db: DBSession,
    files: list[UploadFile] = File(...),
) -> list[AcquisitionFileResponse]:
    acquisition = (await db.execute(select(Acquisition).where(Acquisition.id == acquisition_id))).scalar_one_or_none()
    if not acquisition:
        raise APIError("Acquisition not found.", "acquisition_not_found", 404)
    responses: list[AcquisitionFileResponse] = []
    from app.services.schema_utils import infer_file_type

    for upload in files:
        stored_path, file_size, row_count = await save_upload(acquisition_id, upload)
        record = AcquisitionFile(
            acquisition_id=acquisition_id,
            filename=upload.filename or stored_path.name,
            file_type=infer_file_type(upload.filename or stored_path.name),
            row_count=row_count,
            file_size_bytes=file_size,
            storage_path=str(stored_path),
        )
        db.add(record)
        await db.commit()
        await db.refresh(record)
        responses.append(AcquisitionFileResponse.model_validate(record))
    return responses


@router.get("/acquisitions/{acquisition_id}/files", response_model=list[AcquisitionFileResponse])
async def list_files(acquisition_id: UUID, _: CurrentUser, db: DBSession) -> list[AcquisitionFileResponse]:
    result = await db.execute(
        select(AcquisitionFile)
        .where(AcquisitionFile.acquisition_id == acquisition_id)
        .order_by(AcquisitionFile.uploaded_at.desc())
    )
    return [AcquisitionFileResponse.model_validate(item) for item in result.scalars().all()]


@router.delete("/acquisitions/{acquisition_id}/files/{file_id}", response_model=MessageResponse)
async def delete_file(acquisition_id: UUID, file_id: UUID, _: CurrentUser, db: DBSession) -> MessageResponse:
    result = await db.execute(
        select(AcquisitionFile).where(
            AcquisitionFile.acquisition_id == acquisition_id,
            AcquisitionFile.id == file_id,
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise APIError("File not found.", "file_not_found", 404)
    path = Path(record.storage_path)
    if path.exists():
        path.unlink()
    await db.delete(record)
    await db.commit()
    return MessageResponse(detail="File deleted.", code="file_deleted")


_STATIC_SCHEMA_DIRS: dict[str, Path] = {
    "cch": settings.static_dir / "CCH_schema",
    "client": settings.static_dir / "Client_schema",
}
_DISCOVERY_FILE = settings.static_dir / "Discovery" / "discovery_questions.json"
_HEURISTICS_DIR = settings.static_dir / "Heuristics"
_SQL_TEMPLATES_DIR = settings.static_dir / "SQL_templates"


def _safe_slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")
    if not slug:
        raise APIError("Invalid project slug.", "invalid_project_slug", 400)
    return slug


def _get_static_schema_dir(folder: str) -> Path:
    dir_path = _STATIC_SCHEMA_DIRS.get(folder)
    if dir_path and dir_path.exists():
        return dir_path
    if settings.static_dir.exists():
        return settings.static_dir
    raise APIError("Unknown schema folder.", "not_found", 404)


@router.get("/utils/static-schemas/{folder}", response_model=list[str])
async def list_static_schemas(folder: str) -> list[str]:
    dir_path = _get_static_schema_dir(folder)
    return sorted(f.name for f in dir_path.iterdir() if f.is_file() and f.suffix == ".json")


@router.get("/utils/static-schemas/{folder}/{filename}")
async def get_static_schema(folder: str, filename: str) -> JSONResponse:
    dir_path = _get_static_schema_dir(folder)
    file_path = (dir_path / filename).resolve()
    if not file_path.is_relative_to(dir_path.resolve()):
        raise APIError("Invalid filename.", "forbidden", 403)
    if not file_path.exists() or not file_path.is_file():
        raise APIError("File not found.", "not_found", 404)
    return JSONResponse(content=json.loads(file_path.read_text(encoding="utf-8")))


@router.get("/utils/discovery-questions")
async def get_discovery_questions() -> JSONResponse:
    if not _DISCOVERY_FILE.exists():
        raise APIError("Discovery questions file not found.", "not_found", 404)
    return JSONResponse(content=json.loads(_DISCOVERY_FILE.read_text(encoding="utf-8")))


@router.get("/utils/heuristics/{project_slug}")
async def get_heuristics_text(project_slug: str) -> dict[str, str]:
    slug = _safe_slug(project_slug)
    file_path = _HEURISTICS_DIR / f"{slug}_heuristics.txt"
    if not file_path.exists():
        return {"content": ""}
    return {"content": file_path.read_text(encoding="utf-8")}


@router.put("/utils/heuristics/{project_slug}", response_model=MessageResponse)
async def save_heuristics_text(project_slug: str, payload: HeuristicsTextRequest) -> MessageResponse:
    slug = _safe_slug(project_slug)
    _HEURISTICS_DIR.mkdir(parents=True, exist_ok=True)
    file_path = _HEURISTICS_DIR / f"{slug}_heuristics.txt"
    file_path.write_text(payload.content, encoding="utf-8")
    return MessageResponse(detail="Heuristics saved.", code="heuristics_saved")


@router.get("/utils/sql-templates", response_model=list[SqlTemplateResponse])
async def list_sql_templates() -> list[SqlTemplateResponse]:
    if not _SQL_TEMPLATES_DIR.exists():
        raise APIError("SQL templates folder not found.", "not_found", 404)
    return [
        SqlTemplateResponse(name=file_path.name, content=file_path.read_text(encoding="utf-8"))
        for file_path in sorted(_SQL_TEMPLATES_DIR.iterdir())
        if file_path.is_file() and file_path.suffix.lower() == ".sql"
    ]


@router.post("/utils/enrich-schema")
async def enrich_schema_utility(file: UploadFile = File(...)) -> FileResponse:
    stored_path, _, _ = await save_upload(None, file)
    payload = json.loads(stored_path.read_text(encoding="utf-8"))
    records = normalize_schema_payload(payload)
    grouped = group_schema_records(records)
    enriched = await enrich_grouped_schema(grouped)
    output_path = stored_path.with_name(f"{stored_path.stem}_enriched.json")
    output_path.write_text(json.dumps(enriched, indent=2), encoding="utf-8")
    return FileResponse(path=str(output_path), filename=output_path.name, media_type="application/json")
