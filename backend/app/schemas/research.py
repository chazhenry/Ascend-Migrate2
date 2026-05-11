from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ResearchProgramUpsertRequest(BaseModel):
    goal: str | None = None
    constraints: str | None = None
    prompt_template: str | None = None
    scoring_config: dict[str, Any] | None = None
    model_settings: dict[str, Any] | None = None


class ResearchProgramResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    acquisition_id: str
    goal: str | None
    constraints: str | None
    prompt_template: str | None
    scoring_config: dict[str, Any] | None
    model_settings: dict[str, Any] | None
    updated_by: str | None
    created_at: datetime
    updated_at: datetime


class ResearchRunCreateRequest(BaseModel):
    goal: str | None = None
    max_iterations: int = Field(default=10, ge=1, le=200)
    target_metrics_artifact_id: str | None = None
    source_schema_artifact_id: str | None = None
    model_name: str | None = None
    program_override: str | None = None


class ResearchRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    acquisition_id: str
    status: str
    goal: str | None
    max_iterations: int
    current_iteration: int
    target_metrics_artifact_id: str | None
    source_schema_artifact_id: str | None
    model_name: str | None
    program_override: str | None
    best_experiment_id: str | None
    best_score: float | None
    triggered_by: str
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


class ResearchStatusResponse(BaseModel):
    run: ResearchRunResponse | None


class ResearchExperimentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    run_id: str
    iteration: int
    status: str
    prompt_text: str | None
    sql_text: str | None
    execution_summary: dict[str, Any] | None
    metrics_expected: dict[str, Any] | None
    metrics_observed: dict[str, Any] | None
    score_breakdown: dict[str, Any] | None
    score: float | None
    error_text: str | None
    accepted: bool
    created_at: datetime
