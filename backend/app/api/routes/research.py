from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import CurrentUser, DBSession
from app.core.errors import APIError
from app.models.acquisition import Acquisition
from app.models.research_experiment import ResearchExperiment
from app.models.research_program import ResearchProgram
from app.models.research_run import ResearchRun
from app.schemas.research import (
    ResearchExperimentResponse,
    ResearchProgramResponse,
    ResearchProgramUpsertRequest,
    ResearchRunCreateRequest,
    ResearchRunResponse,
    ResearchStatusResponse,
)


router = APIRouter(prefix="/acquisitions/{acquisition_id}/research", tags=["research"])


async def _get_acquisition(db: DBSession, acquisition_id: UUID) -> Acquisition:
    acquisition = (await db.execute(select(Acquisition).where(Acquisition.id == acquisition_id))).scalar_one_or_none()
    if not acquisition:
        raise APIError("Acquisition not found.", "acquisition_not_found", 404)
    return acquisition


@router.get("/program", response_model=ResearchProgramResponse | None)
async def get_research_program(acquisition_id: UUID, _: CurrentUser, db: DBSession) -> ResearchProgramResponse | None:
    await _get_acquisition(db, acquisition_id)
    program = (await db.execute(select(ResearchProgram).where(ResearchProgram.acquisition_id == acquisition_id))).scalar_one_or_none()
    return ResearchProgramResponse.model_validate(program) if program else None


@router.put("/program", response_model=ResearchProgramResponse)
async def upsert_research_program(
    acquisition_id: UUID,
    payload: ResearchProgramUpsertRequest,
    user: CurrentUser,
    db: DBSession,
) -> ResearchProgramResponse:
    await _get_acquisition(db, acquisition_id)
    program = (await db.execute(select(ResearchProgram).where(ResearchProgram.acquisition_id == acquisition_id))).scalar_one_or_none()
    if program is None:
        program = ResearchProgram(acquisition_id=acquisition_id, updated_by=user.id)
        db.add(program)
    program.goal = payload.goal
    program.constraints = payload.constraints
    program.prompt_template = payload.prompt_template
    program.scoring_config = payload.scoring_config
    program.model_settings = payload.model_settings
    program.updated_by = user.id
    await db.commit()
    await db.refresh(program)
    return ResearchProgramResponse.model_validate(program)


@router.post("/run", response_model=ResearchRunResponse)
async def create_research_run(
    acquisition_id: UUID,
    payload: ResearchRunCreateRequest,
    user: CurrentUser,
    db: DBSession,
) -> ResearchRunResponse:
    await _get_acquisition(db, acquisition_id)
    run = ResearchRun(
        acquisition_id=acquisition_id,
        status="queued",
        goal=payload.goal,
        max_iterations=payload.max_iterations,
        target_metrics_artifact_id=UUID(payload.target_metrics_artifact_id) if payload.target_metrics_artifact_id else None,
        source_schema_artifact_id=UUID(payload.source_schema_artifact_id) if payload.source_schema_artifact_id else None,
        model_name=payload.model_name,
        program_override=payload.program_override,
        triggered_by=user.id,
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return ResearchRunResponse.model_validate(run)


@router.get("/status", response_model=ResearchStatusResponse)
async def get_research_status(acquisition_id: UUID, _: CurrentUser, db: DBSession) -> ResearchStatusResponse:
    await _get_acquisition(db, acquisition_id)
    run = (
        await db.execute(
            select(ResearchRun)
            .where(ResearchRun.acquisition_id == acquisition_id)
            .order_by(ResearchRun.created_at.desc(), ResearchRun.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return ResearchStatusResponse(run=ResearchRunResponse.model_validate(run) if run else None)


@router.post("/cancel", response_model=ResearchRunResponse)
async def cancel_research_run(acquisition_id: UUID, _: CurrentUser, db: DBSession) -> ResearchRunResponse:
    await _get_acquisition(db, acquisition_id)
    run = (
        await db.execute(
            select(ResearchRun)
            .where(ResearchRun.acquisition_id == acquisition_id, ResearchRun.status.in_(["queued", "running"]))
            .order_by(ResearchRun.created_at.desc(), ResearchRun.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if run is None:
        raise APIError("No active research run found.", "research_run_not_found", 404)
    run.status = "canceled"
    await db.commit()
    await db.refresh(run)
    return ResearchRunResponse.model_validate(run)


@router.get("/experiments", response_model=list[ResearchExperimentResponse])
async def list_research_experiments(
    acquisition_id: UUID,
    _: CurrentUser,
    db: DBSession,
    run_id: UUID | None = None,
) -> list[ResearchExperimentResponse]:
    await _get_acquisition(db, acquisition_id)
    query = (
        select(ResearchExperiment)
        .join(ResearchRun, ResearchExperiment.run_id == ResearchRun.id)
        .where(ResearchRun.acquisition_id == acquisition_id)
        .order_by(ResearchExperiment.created_at.asc(), ResearchExperiment.iteration.asc())
    )
    if run_id is not None:
        query = query.where(ResearchExperiment.run_id == run_id)
    experiments = (await db.execute(query)).scalars().all()
    return [ResearchExperimentResponse.model_validate(item) for item in experiments]


@router.get("/experiments/{experiment_id}", response_model=ResearchExperimentResponse)
async def get_research_experiment(
    acquisition_id: UUID,
    experiment_id: UUID,
    _: CurrentUser,
    db: DBSession,
) -> ResearchExperimentResponse:
    await _get_acquisition(db, acquisition_id)
    experiment = (
        await db.execute(
            select(ResearchExperiment)
            .join(ResearchRun, ResearchExperiment.run_id == ResearchRun.id)
            .where(ResearchRun.acquisition_id == acquisition_id, ResearchExperiment.id == experiment_id)
        )
    ).scalar_one_or_none()
    if experiment is None:
        raise APIError("Research experiment not found.", "research_experiment_not_found", 404)
    return ResearchExperimentResponse.model_validate(experiment)


@router.post("/experiments/{experiment_id}/promote", response_model=ResearchRunResponse)
async def promote_research_experiment(
    acquisition_id: UUID,
    experiment_id: UUID,
    _: CurrentUser,
    db: DBSession,
) -> ResearchRunResponse:
    await _get_acquisition(db, acquisition_id)
    experiment = (
        await db.execute(
            select(ResearchExperiment)
            .join(ResearchRun, ResearchExperiment.run_id == ResearchRun.id)
            .where(ResearchRun.acquisition_id == acquisition_id, ResearchExperiment.id == experiment_id)
        )
    ).scalar_one_or_none()
    if experiment is None:
        raise APIError("Research experiment not found.", "research_experiment_not_found", 404)

    run = (await db.execute(select(ResearchRun).where(ResearchRun.id == experiment.run_id))).scalar_one()
    sibling_experiments = (await db.execute(select(ResearchExperiment).where(ResearchExperiment.run_id == run.id))).scalars().all()
    for sibling in sibling_experiments:
        sibling.accepted = sibling.id == experiment.id
    run.best_experiment_id = experiment.id
    run.best_score = experiment.score
    await db.commit()
    await db.refresh(run)
    return ResearchRunResponse.model_validate(run)
