import json
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.job import Job
from app.services.ai import call_json_prompt
from app.services.jobs import append_job_log, save_artifact
from app.services.pipeline import finalize_stage, get_acquisition, list_acquisition_files, mark_stage_running
from app.services.schema_utils import group_schema_records, normalize_schema_payload


def _heuristic_enrichment(grouped_schema: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    for table_name, table_payload in grouped_schema.items():
        for column in table_payload.get("columns", []):
            column_name = str(column.get("column_name") or "unknown")
            normalized = column_name.replace("_", " ").replace("tbl", "").strip()
            data_type = str(column.get("data_type") or "value")
            description = f"Stores {normalized.lower()} for the {table_name} record in the source practice management system."
            common_names = [normalized, normalized.lower(), column_name.lower()]
            example_values = [
                "1001" if "id" in column_name.lower() else "Example Value",
                "2024-01-31" if "date" in column_name.lower() else "Sample",
                "Active" if "status" in column_name.lower() else data_type,
            ]
            transformation_notes = (
                "Review format alignment before loading into CCH Axcess Practice."
                if "date" not in column_name.lower()
                else "Convert to ISO date format before loading into CCH Axcess Practice."
            )
            column.update(
                {
                    "description": description,
                    "common_source_names": list(dict.fromkeys([name for name in common_names if name]))[:5],
                    "example_values": example_values[:5],
                    "transformation_notes": transformation_notes,
                }
            )
    return grouped_schema


async def enrich_grouped_schema(grouped_schema: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    try:
        response = await call_json_prompt("enrich_system.md", grouped_schema)
        if not isinstance(response, dict):
            raise ValueError("Unexpected enrichment response type")
        return response
    except Exception:
        return _heuristic_enrichment(grouped_schema)


async def load_raw_schema_from_files(acquisition_id: UUID, db: AsyncSession) -> list[dict[str, Any]]:
    files = await list_acquisition_files(db, acquisition_id)
    schema_files = [file for file in files if file.file_type == "schema_json"]
    if not schema_files:
        raise ValueError("No schema JSON files uploaded for Stage 2")
    records: list[dict[str, Any]] = []
    for file in schema_files:
        payload = json.loads(Path(file.storage_path).read_text(encoding="utf-8"))
        records.extend(normalize_schema_payload(payload))
    return records


async def run_stage(acquisition_id: UUID, job_id: UUID, db: AsyncSession) -> None:
    acquisition = await get_acquisition(db, acquisition_id)
    await mark_stage_running(db, acquisition)
    job = (await db.execute(select(Job).where(Job.id == job_id))).scalar_one()

    await append_job_log(db, job, "Loading raw schema records.")
    records = await load_raw_schema_from_files(acquisition_id, db)
    grouped_schema = group_schema_records(records)
    await append_job_log(db, job, f"Grouped schema into {len(grouped_schema)} tables.")

    enriched = await enrich_grouped_schema(grouped_schema)
    await append_job_log(db, job, "Enrichment completed; saving artifact.")
    await save_artifact(db, acquisition_id, 2, "enriched_source_schema", content=enriched)
    await finalize_stage(db, acquisition, 2, "idle")
