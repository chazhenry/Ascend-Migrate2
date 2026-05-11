from datetime import datetime

from pydantic import BaseModel, ConfigDict


class JobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    acquisition_id: str
    stage: int
    status: str
    log: str
    started_at: datetime | None
    completed_at: datetime | None
    triggered_by: str


class JobSummaryResponse(BaseModel):
    job: JobResponse | None
    stage_status: str
