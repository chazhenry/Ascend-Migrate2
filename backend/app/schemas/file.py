from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AcquisitionFileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    acquisition_id: str
    filename: str
    file_type: str
    row_count: int | None
    file_size_bytes: int
    storage_path: str
    uploaded_at: datetime
