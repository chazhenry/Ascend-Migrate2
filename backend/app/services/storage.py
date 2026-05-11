import json
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import UploadFile

from app.core.config import get_settings


settings = get_settings()


async def save_upload(acquisition_id: UUID | None, upload: UploadFile) -> tuple[Path, int, int | None]:
    prefix = str(acquisition_id) if acquisition_id else "utility"
    directory = settings.uploads_dir / prefix
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / f"{uuid4()}_{upload.filename}"
    content = await upload.read()
    destination.write_bytes(content)
    row_count = None
    if destination.suffix.lower() == ".json":
        try:
            payload = json.loads(content.decode("utf-8"))
            if isinstance(payload, list):
                row_count = len(payload)
            elif isinstance(payload, dict):
                row_count = next((len(value) for value in payload.values() if isinstance(value, list)), None)
        except (ValueError, UnicodeDecodeError):
            row_count = None
    elif destination.suffix.lower() == ".csv":
        row_count = max(content.decode("utf-8", errors="ignore").count("\n") - 1, 0)
    return destination, len(content), row_count
