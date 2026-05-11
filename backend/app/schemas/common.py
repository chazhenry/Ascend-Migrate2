from datetime import datetime

from pydantic import BaseModel, ConfigDict


class APIErrorResponse(BaseModel):
    detail: str
    code: str


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class MessageResponse(BaseModel):
    detail: str
    code: str = "ok"


class TimestampedModel(ORMModel):
    created_at: datetime
