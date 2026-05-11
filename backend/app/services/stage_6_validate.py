import csv
import json
import re
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.job import Job
from app.services.ai import load_static_json
from app.services.jobs import append_job_log, save_artifact
from app.services.pipeline import acquisition_workdir, finalize_stage, get_acquisition, mark_stage_running


def _validate_row(row: dict[str, str], entity_schema: dict[str, Any]) -> list[dict[str, Any]]:
    failures: list[dict[str, Any]] = []
    required_fields = [field["name"] for field in entity_schema.get("fields", []) if field.get("required")]
    enum_fields = entity_schema.get("enum_fields", {})
    for field_name in required_fields:
        if not row.get(field_name):
            failures.append({"field": field_name, "constraint": "required", "actual_value": row.get(field_name)})
    for field_name, allowed_values in enum_fields.items():
        value = row.get(field_name)
        if value and value not in allowed_values:
            failures.append({"field": field_name, "constraint": "enum", "actual_value": value})
    for field_name in entity_schema.get("date_fields", []):
        value = row.get(field_name)
        if value and not re.match(r"^\d{4}-\d{2}-\d{2}$", value):
            failures.append({"field": field_name, "constraint": "date_format", "actual_value": value})
    return failures


async def run_stage(acquisition_id: UUID, job_id: UUID, db: AsyncSession) -> None:
    acquisition = await get_acquisition(db, acquisition_id)
    await mark_stage_running(db, acquisition)
    job = (await db.execute(select(Job).where(Job.id == job_id))).scalar_one()

    workdir = acquisition_workdir(acquisition_id)
    outputs_dir = workdir / "etl_output"
    destination_schema = load_static_json("cch_axcess_target_schema_v2.json")
    entities_by_name = {entity["entity"].lower(): entity for entity in destination_schema.get("entities", [])}

    report: dict[str, Any] = {"entities": []}
    if not outputs_dir.exists():
        await append_job_log(db, job, "No ETL output directory found; validation report will be empty.")
    else:
        for csv_path in sorted(outputs_dir.glob("*.csv")):
            entity_name = csv_path.stem.lower()
            entity_schema = entities_by_name.get(entity_name, {"fields": []})
            with csv_path.open("r", encoding="utf-8") as handle:
                reader = csv.DictReader(handle)
                failures: list[dict[str, Any]] = []
                row_count = 0
                for row_index, row in enumerate(reader, start=1):
                    row_count += 1
                    row_failures = _validate_row(row, entity_schema)
                    for failure in row_failures:
                        failures.append({"row_identifier": row_index, **failure})
            report["entities"].append(
                {
                    "entity": entity_name,
                    "row_count": row_count,
                    "pass_count": max(row_count - len(failures), 0),
                    "warn_count": 0,
                    "fail_count": len(failures),
                    "failures": failures,
                }
            )
            await append_job_log(db, job, f"Validated {entity_name}: {len(failures)} failure(s).")

    await save_artifact(db, acquisition_id, 6, "validation_report", content=report)
    await finalize_stage(db, acquisition, 6, "awaiting_review")
