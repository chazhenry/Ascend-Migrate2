from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ManifestOverrideRequest(BaseModel):
    target_entity: str
    target_field: str
    original_value: dict | list
    override_value: dict | list


class ManifestOverrideResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    acquisition_id: str
    target_entity: str
    target_field: str
    original_value: dict | list
    override_value: dict | list
    overridden_by: str
    overridden_at: datetime
