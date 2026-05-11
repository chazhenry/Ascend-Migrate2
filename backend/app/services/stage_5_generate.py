import csv
import io
import json
import zipfile
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.job import Job
from app.services.jobs import append_job_log, save_artifact
from app.services.pipeline import (
    acquisition_source_credentials,
    acquisition_workdir,
    finalize_stage,
    get_acquisition,
    get_latest_artifact_by_type,
    get_manifest_overrides,
    mark_stage_running,
)


def _apply_overrides(manifest: dict[str, Any], overrides: list[dict[str, Any]]) -> dict[str, Any]:
    override_map = {(item["target_entity"], item["target_field"]): item["override_value"] for item in overrides}
    for entity in manifest.get("entities", []):
        for field in entity.get("fields", []):
            key = (entity.get("destination_entity"), field.get("target_field"))
            if key in override_map and isinstance(override_map[key], dict):
                field.update(override_map[key])
    return manifest


def _build_script(entity: dict[str, Any], acquisition: Any) -> str:
    source_table = entity.get("source_table") or "source_table"
    field_selects = []
    output_headers = []
    for field in entity.get("fields", []):
        source_field = field.get("source_field")
        if source_field and "." in source_field:
            _, column = source_field.split(".", 1)
            field_selects.append(f'"{column}"')
            output_headers.append(field.get("target_field"))
    select_list = ", ".join(field_selects) or "*"
    script = f'''import csv
import os
from pathlib import Path

import psycopg


def main() -> None:
    output_dir = Path(os.environ.get("OUTPUT_DIR", "."))
    output_dir.mkdir(parents=True, exist_ok=True)
    conn = psycopg.connect(
        host=os.environ.get("SOURCE_DB_HOST", "{acquisition.source_db_host or ''}"),
        port=os.environ.get("SOURCE_DB_PORT", "{acquisition.source_db_port or ''}"),
        dbname=os.environ.get("SOURCE_DB_NAME", "{acquisition.source_db_name or ''}"),
        user=os.environ.get("SOURCE_DB_USER", "{acquisition.source_db_user or ''}"),
        password=os.environ.get("SOURCE_DB_PASSWORD", ""),
    )
    query = "SELECT {select_list} FROM {source_table}"
    with conn.cursor() as cursor:
        cursor.execute(query)
        rows = cursor.fetchall()
        headers = {[header for header in output_headers]}
        with (output_dir / "{entity.get('destination_entity', 'entity').lower()}.csv").open("w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow(headers if headers else [item[0] for item in cursor.description])
            writer.writerows(rows)


if __name__ == "__main__":
    main()
'''
    return script


async def run_stage(acquisition_id: UUID, job_id: UUID, db: AsyncSession) -> None:
    acquisition = await get_acquisition(db, acquisition_id)
    await mark_stage_running(db, acquisition)
    job = (await db.execute(select(Job).where(Job.id == job_id))).scalar_one()

    manifest_artifact = await get_latest_artifact_by_type(db, acquisition_id, "mapping_manifest")
    if not manifest_artifact or not manifest_artifact.content:
        raise ValueError("Stage 4 mapping manifest is required before Stage 5")

    overrides = await get_manifest_overrides(db, acquisition_id)
    manifest = _apply_overrides(
        json.loads(json.dumps(manifest_artifact.content)),
        [
            {
                "target_entity": item.target_entity,
                "target_field": item.target_field,
                "override_value": item.override_value,
            }
            for item in overrides
        ],
    )

    workdir = acquisition_workdir(acquisition_id)
    scripts_dir = workdir / "scripts"
    outputs_dir = workdir / "etl_output"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    outputs_dir.mkdir(parents=True, exist_ok=True)

    await append_job_log(db, job, "Generating ETL scripts from mapping manifest.")
    run_summary: list[dict[str, Any]] = []
    zip_path = workdir / "generated_etl_scripts.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zip_handle:
        for entity in manifest.get("entities", []):
            filename = f"{entity.get('destination_entity', 'entity').lower()}.py"
            script_content = _build_script(entity, acquisition)
            file_path = scripts_dir / filename
            file_path.write_text(script_content, encoding="utf-8")
            zip_handle.writestr(filename, script_content)
            run_summary.append(
                {
                    "entity": entity.get("destination_entity"),
                    "rows_processed": 0,
                    "rows_dropped": 0,
                    "rows_warned": 0,
                }
            )

    await save_artifact(db, acquisition_id, 5, "generated_etl_scripts", file_path=str(zip_path), content={"run_summary": run_summary})
    await append_job_log(db, job, f"Generated {len(run_summary)} ETL scripts.")

    credentials = acquisition_source_credentials(acquisition)
    if not all([credentials["host"], credentials["port"], credentials["database"], credentials["user"], credentials["password"]]):
        await append_job_log(db, job, "Source DB credentials incomplete; skipping ETL execution and leaving scripts ready for download.")
        await finalize_stage(db, acquisition, 5, "idle")
        return

    for entity in manifest.get("entities", []):
        output_path = outputs_dir / f"{entity.get('destination_entity', 'entity').lower()}.csv"
        field_names = [field.get("target_field") for field in entity.get("fields", []) if field.get("target_field")]
        with output_path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow(field_names)
        await append_job_log(db, job, f"Prepared ETL output shell for {entity.get('destination_entity')}.")

    await finalize_stage(db, acquisition, 5, "idle")
