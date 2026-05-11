import json
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.jobs import append_job_log, save_artifact
from app.services.pipeline import finalize_stage, get_acquisition, list_acquisition_files, mark_stage_running
from app.services.schema_utils import normalize_schema_payload


def _load_signature_files(signatures_dir: Path) -> list[dict[str, Any]]:
    signatures: list[dict[str, Any]] = []
    for path in sorted(signatures_dir.glob("*.json")):
        signatures.append(json.loads(path.read_text(encoding="utf-8")))
    return signatures


def _score_signature(signature: dict[str, Any], records: list[dict[str, Any]]) -> dict[str, Any]:
    tables = {str(record.get("table_name", "")).lower() for record in records}
    columns = {
        f"{str(record.get('table_name', '')).lower()}.{str(record.get('column_name', '')).lower()}"
        for record in records
    }
    required_tables = {table.lower() for table in signature.get("required_tables", [])}
    matched_tables = sorted(required_tables.intersection(tables))
    required_match = len(matched_tables) == len(required_tables)
    score = len(matched_tables) * 5
    for scored_column in signature.get("scored_columns", []):
        if str(scored_column).lower() in columns:
            score += 1
    max_score = max(int(signature.get("max_score", score or 1)), 1)
    confidence = min(score / max_score, 1.0)
    if not required_match:
        confidence *= 0.5
    return {
        "system": signature.get("system_name"),
        "version_hint": signature.get("version_hint"),
        "score": score,
        "max_score": max_score,
        "confidence": round(confidence, 3),
        "matched_tables": matched_tables,
        "required_match": required_match,
    }


async def run_stage(acquisition_id: UUID, job_id: UUID, db: AsyncSession) -> None:
    acquisition = await get_acquisition(db, acquisition_id)
    await mark_stage_running(db, acquisition)

    from app.core.config import get_settings
    from app.models.job import Job
    from sqlalchemy import select

    job = (await db.execute(select(Job).where(Job.id == job_id))).scalar_one()
    await append_job_log(db, job, "Loading uploaded schema files.")
    files = await list_acquisition_files(db, acquisition_id)
    schema_files = [file for file in files if file.file_type == "schema_json"]
    if not schema_files:
        raise ValueError("No schema JSON files uploaded for Stage 1")

    records: list[dict[str, Any]] = []
    for file in schema_files:
        payload = json.loads(Path(file.storage_path).read_text(encoding="utf-8"))
        records.extend(normalize_schema_payload(payload))

    await append_job_log(db, job, f"Loaded {len(records)} schema rows across {len(schema_files)} file(s).")

    settings = get_settings()
    signature_results = [_score_signature(signature, records) for signature in _load_signature_files(settings.signature_dir)]
    winner = max(signature_results, key=lambda item: item["confidence"], default=None)
    if not winner:
        raise ValueError("No signature libraries available")

    artifact_content = {
        "system": winner["system"],
        "version_hint": winner["version_hint"],
        "confidence": winner["confidence"],
        "matched_tables": winner["matched_tables"],
        "signature_results": signature_results,
    }
    await save_artifact(db, acquisition_id, 1, "enriched_source_schema", content=artifact_content)
    acquisition.source_system = winner["system"]
    acquisition.source_system_confidence = winner["confidence"]
    await db.commit()
    await append_job_log(db, job, f"Detected source system {winner['system']} at {winner['confidence']:.1%} confidence.")
    await finalize_stage(db, acquisition, 1, "idle")
