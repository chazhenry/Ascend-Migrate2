from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import decrypt_value
from app.models.acquisition import Acquisition
from app.models.acquisition_file import AcquisitionFile
from app.models.discovery_answer import DiscoveryAnswer
from app.models.manifest_override import ManifestOverride
from app.models.stage_artifact import StageArtifact


settings = get_settings()


async def get_acquisition(db: AsyncSession, acquisition_id: UUID) -> Acquisition:
    result = await db.execute(select(Acquisition).where(Acquisition.id == acquisition_id))
    acquisition = result.scalar_one()
    return acquisition


async def get_stage_artifact(db: AsyncSession, acquisition_id: UUID, stage: int, artifact_type: str) -> StageArtifact | None:
    result = await db.execute(
        select(StageArtifact)
        .where(
            StageArtifact.acquisition_id == acquisition_id,
            StageArtifact.stage == stage,
            StageArtifact.artifact_type == artifact_type,
        )
        .order_by(StageArtifact.version.desc(), StageArtifact.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_latest_artifact_by_type(db: AsyncSession, acquisition_id: UUID, artifact_type: str) -> StageArtifact | None:
    result = await db.execute(
        select(StageArtifact)
        .where(StageArtifact.acquisition_id == acquisition_id, StageArtifact.artifact_type == artifact_type)
        .order_by(StageArtifact.version.desc(), StageArtifact.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def list_acquisition_files(db: AsyncSession, acquisition_id: UUID) -> list[AcquisitionFile]:
    result = await db.execute(
        select(AcquisitionFile).where(AcquisitionFile.acquisition_id == acquisition_id).order_by(AcquisitionFile.uploaded_at.asc())
    )
    return list(result.scalars().all())


async def get_discovery_answers(db: AsyncSession, acquisition_id: UUID) -> list[DiscoveryAnswer]:
    result = await db.execute(
        select(DiscoveryAnswer)
        .where(DiscoveryAnswer.acquisition_id == acquisition_id)
        .order_by(DiscoveryAnswer.question_key.asc())
    )
    return list(result.scalars().all())


async def get_manifest_overrides(db: AsyncSession, acquisition_id: UUID) -> list[ManifestOverride]:
    result = await db.execute(
        select(ManifestOverride)
        .where(ManifestOverride.acquisition_id == acquisition_id)
        .order_by(ManifestOverride.overridden_at.desc())
    )
    return list(result.scalars().all())


async def mark_stage_running(db: AsyncSession, acquisition: Acquisition) -> None:
    acquisition.stage_status = "running"
    acquisition.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(acquisition)


async def finalize_stage(db: AsyncSession, acquisition: Acquisition, stage: int, status: str) -> None:
    acquisition.stage_status = status
    if stage == 7:
        acquisition.current_stage = 7
    elif status == "awaiting_review":
        acquisition.current_stage = stage
    else:
        acquisition.current_stage = min(stage + 1, 7)
    acquisition.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(acquisition)


def acquisition_workdir(acquisition_id: UUID) -> Path:
    path = settings.generated_dir / str(acquisition_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


def acquisition_source_credentials(acquisition: Acquisition) -> dict[str, str | int | None]:
    return {
        "host": acquisition.source_db_host,
        "port": acquisition.source_db_port,
        "database": acquisition.source_db_name,
        "schema": acquisition.source_db_schema,
        "user": acquisition.source_db_user,
        "password": decrypt_value(acquisition.source_db_password),
    }
