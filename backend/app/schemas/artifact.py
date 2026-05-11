from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ArtifactResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    acquisition_id: str
    stage: int
    artifact_type: str
    content: dict | list | None
    file_path: str | None
    version: int
    created_at: datetime
