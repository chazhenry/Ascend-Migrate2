from collections.abc import Callable
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks
from sqlalchemy import select

from app.api.deps import CurrentUser, DBSession
from app.core.database import AsyncSessionLocal
from app.core.errors import APIError
from app.models.acquisition import Acquisition
from app.models.job import Job
from app.schemas.artifact import ArtifactResponse
from app.schemas.job import JobResponse, JobSummaryResponse
from app.services.jobs import complete_job, fail_job, start_job
from app.services.pipeline import get_stage_artifact
from app.services.stage_1_detect import run_stage as run_stage_1
from app.services.stage_2_enrich import run_stage as run_stage_2
from app.services.stage_3_discover import run_stage as run_stage_3
from app.services.stage_4_map import run_stage as run_stage_4
from app.services.stage_5_generate import run_stage as run_stage_5
from app.services.stage_6_validate import run_stage as run_stage_6
from app.services.stage_7_output import run_stage as run_stage_7


router = APIRouter(prefix="/acquisitions/{acquisition_id}/stages", tags=["stages"])


STAGE_RUNNERS: dict[int, Callable[[UUID, UUID, DBSession], object]] = {
    1: run_stage_1,
    2: run_stage_2,
    3: run_stage_3,
    4: run_stage_4,
    5: run_stage_5,
    6: run_stage_6,
    7: run_stage_7,
}


async def _run_stage_job(acquisition_id: UUID, stage_num: int, job_id: UUID) -> None:
    async with AsyncSessionLocal() as db:
        acquisition = (await db.execute(select(Acquisition).where(Acquisition.id == acquisition_id))).scalar_one()
        job = (await db.execute(select(Job).where(Job.id == job_id))).scalar_one()
        await start_job(db, job)
        try:
            await STAGE_RUNNERS[stage_num](acquisition_id, job_id, db)
            await complete_job(db, job)
        except Exception as exc:
            await fail_job(db, job, acquisition, str(exc))


@router.post("/{stage_num}/run", response_model=JobResponse)
async def run_stage(
    acquisition_id: UUID,
    stage_num: int,
    background_tasks: BackgroundTasks,
    user: CurrentUser,
    db: DBSession,
) -> JobResponse:
    if stage_num not in STAGE_RUNNERS:
        raise APIError("Unsupported stage number.", "invalid_stage", 400)
    acquisition = (await db.execute(select(Acquisition).where(Acquisition.id == acquisition_id))).scalar_one_or_none()
    if not acquisition:
        raise APIError("Acquisition not found.", "acquisition_not_found", 404)
    job = Job(acquisition_id=acquisition_id, stage=stage_num, status="queued", log="", triggered_by=user.id)
    db.add(job)
    await db.commit()
    await db.refresh(job)
    background_tasks.add_task(_run_stage_job, acquisition_id, stage_num, job.id)
    return JobResponse.model_validate(job)


@router.get("/{stage_num}/status", response_model=JobSummaryResponse)
async def stage_status(acquisition_id: UUID, stage_num: int, _: CurrentUser, db: DBSession) -> JobSummaryResponse:
    acquisition = (await db.execute(select(Acquisition).where(Acquisition.id == acquisition_id))).scalar_one_or_none()
    if not acquisition:
        raise APIError("Acquisition not found.", "acquisition_not_found", 404)
    result = await db.execute(
        select(Job)
        .where(Job.acquisition_id == acquisition_id, Job.stage == stage_num)
        .order_by(Job.started_at.desc().nullslast(), Job.id.desc())
        .limit(1)
    )
    job = result.scalar_one_or_none()
    return JobSummaryResponse(stage_status=acquisition.stage_status, job=JobResponse.model_validate(job) if job else None)


@router.get("/{stage_num}/artifact", response_model=ArtifactResponse)
async def latest_stage_artifact(acquisition_id: UUID, stage_num: int, _: CurrentUser, db: DBSession) -> ArtifactResponse:
    artifact_type_map = {
        1: "enriched_source_schema",
        2: "enriched_source_schema",
        3: "discovery_questions",
        4: "mapping_manifest",
        5: "generated_etl_scripts",
        6: "validation_report",
        7: "cch_excel_output",
    }
    artifact = await get_stage_artifact(db, acquisition_id, stage_num, artifact_type_map.get(stage_num, ""))
    if not artifact:
        raise APIError("Artifact not found.", "artifact_not_found", 404)
    return ArtifactResponse.model_validate(artifact)
