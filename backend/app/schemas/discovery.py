from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DiscoveryAnswerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    acquisition_id: str
    question_key: str
    question_text: str
    why_blocking: str
    answer: str | None
    is_required: bool
    answered_by: str | None
    answered_at: datetime | None


class DiscoveryAnswerUpdateRequest(BaseModel):
    answer: str
