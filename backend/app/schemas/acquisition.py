from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.artifact import ArtifactResponse
from app.schemas.discovery import DiscoveryAnswerResponse
from app.schemas.file import AcquisitionFileResponse
from app.schemas.job import JobResponse
from app.schemas.manifest import ManifestOverrideResponse


class AcquisitionBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    historical_years: int = Field(default=3, ge=1, le=20)
    source_db_host: str | None = None
    source_db_port: int | None = Field(default=None, ge=1, le=65535)
    source_db_name: str | None = None
    source_db_schema: str | None = None
    source_db_user: str | None = None
    source_db_password: str | None = None
    status: str | None = None


class AcquisitionCreateRequest(AcquisitionBase):
    pass


class AcquisitionUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    historical_years: int | None = Field(default=None, ge=1, le=20)
    source_db_host: str | None = None
    source_db_port: int | None = Field(default=None, ge=1, le=65535)
    source_db_name: str | None = None
    source_db_schema: str | None = None
    source_db_user: str | None = None
    source_db_password: str | None = None
    status: str | None = None


class AcquisitionListItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    source_system: str | None
    source_system_confidence: float | None
    current_stage: int
    stage_status: str
    historical_years: int
    updated_at: datetime
    status: str


class AcquisitionDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    source_system: str | None
    source_system_confidence: float | None
    current_stage: int
    stage_status: str
    historical_years: int
    source_db_host: str | None
    source_db_port: int | None
    source_db_name: str | None
    source_db_schema: str | None
    source_db_user: str | None
    created_by: str
    created_at: datetime
    updated_at: datetime
    status: str
    files: list[AcquisitionFileResponse] = []
    artifacts: list[ArtifactResponse] = []
    jobs: list[JobResponse] = []
    discovery_answers: list[DiscoveryAnswerResponse] = []
    manifest_overrides: list[ManifestOverrideResponse] = []
