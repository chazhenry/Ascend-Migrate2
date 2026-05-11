from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.acquisition import Acquisition
from app.models.job import Job
from app.models.stage_artifact import StageArtifact


async def append_job_log(db: AsyncSession, job: Job, message: str) -> None:
    timestamp = datetime.now(UTC).isoformat()
    prefix = f"[{timestamp}] {message}".strip()
    job.log = f"{job.log}\n{prefix}".strip()
    await db.commit()
    await db.refresh(job)


async def start_job(db: AsyncSession, job: Job) -> None:
    job.status = "running"
    job.started_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(job)


async def complete_job(db: AsyncSession, job: Job) -> None:
    job.status = "complete"
    job.completed_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(job)


async def fail_job(db: AsyncSession, job: Job, acquisition: Acquisition, detail: str) -> None:
    job.status = "failed"
    job.completed_at = datetime.now(UTC)
    acquisition.stage_status = "blocked"
    await append_job_log(db, job, f"ERROR: {detail}")
    await db.commit()
    await db.refresh(job)


async def latest_job_for_stage(db: AsyncSession, acquisition_id: UUID, stage: int) -> Job | None:
    query = select(Job).where(Job.acquisition_id == acquisition_id, Job.stage == stage).order_by(Job.started_at.desc().nullslast(), Job.id.desc()).limit(1)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def next_artifact_version(db: AsyncSession, acquisition_id: UUID, stage: int, artifact_type: str) -> int:
    result = await db.execute(
        select(func.max(StageArtifact.version)).where(
            StageArtifact.acquisition_id == acquisition_id,
            StageArtifact.stage == stage,
            StageArtifact.artifact_type == artifact_type,
        )
    )
    current_max = result.scalar_one_or_none() or 0
    return int(current_max) + 1


async def save_artifact(
    db: AsyncSession,
    acquisition_id: UUID,
    stage: int,
    artifact_type: str,
    content: dict[str, Any] | list[Any] | None = None,
    file_path: str | None = None,
) -> StageArtifact:
    artifact = StageArtifact(
        acquisition_id=acquisition_id,
        stage=stage,
        artifact_type=artifact_type,
        content=content,
        file_path=file_path,
        version=await next_artifact_version(db, acquisition_id, stage, artifact_type),
    )
    db.add(artifact)
    await db.commit()
    await db.refresh(artifact)
    return artifact
