from pathlib import Path
from uuid import UUID

from fastapi import APIRouter
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.api.deps import CurrentUser, CurrentUserOrQueryToken, DBSession
from app.core.errors import APIError
from app.models.stage_artifact import StageArtifact
from app.schemas.artifact import ArtifactResponse


router = APIRouter(prefix="/acquisitions/{acquisition_id}/artifacts", tags=["artifacts"])


@router.get("", response_model=list[ArtifactResponse])
async def list_artifacts(acquisition_id: UUID, _: CurrentUser, db: DBSession) -> list[ArtifactResponse]:
    result = await db.execute(
        select(StageArtifact)
        .where(StageArtifact.acquisition_id == acquisition_id)
        .order_by(StageArtifact.stage.asc(), StageArtifact.created_at.desc())
    )
    return [ArtifactResponse.model_validate(item) for item in result.scalars().all()]


@router.get("/{artifact_id}/download")
async def download_artifact(acquisition_id: UUID, artifact_id: UUID, _: CurrentUserOrQueryToken, db: DBSession) -> FileResponse:
    result = await db.execute(
        select(StageArtifact).where(
            StageArtifact.acquisition_id == acquisition_id,
            StageArtifact.id == artifact_id,
        )
    )
    artifact = result.scalar_one_or_none()
    if not artifact or not artifact.file_path:
        raise APIError("Binary artifact not found.", "artifact_not_found", 404)
    file_path = Path(artifact.file_path)
    if not file_path.exists():
        raise APIError("Artifact file is missing on disk.", "artifact_missing", 404)
    return FileResponse(path=str(file_path), filename=file_path.name)
