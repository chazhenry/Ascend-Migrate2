import re
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.job import Job
from app.services.ai import call_json_prompt, load_prompt, load_static_json
from app.services.jobs import append_job_log, save_artifact
from app.services.pipeline import (
    finalize_stage,
    get_acquisition,
    get_discovery_answers,
    get_latest_artifact_by_type,
    mark_stage_running,
)


def _tokenize(value: str) -> set[str]:
    return {token for token in re.split(r"[^a-z0-9]+", value.lower()) if token}


def _fallback_manifest(
    enriched_schema: dict[str, Any],
    destination_schema: dict[str, Any],
    discovery_answers: list[dict[str, Any]],
) -> dict[str, Any]:
    source_columns: list[dict[str, Any]] = []
    for table_name, payload in enriched_schema.items():
        for column in payload.get("columns", []):
            source_columns.append({"table_name": table_name, **column})

    entities: list[dict[str, Any]] = []
    gaps: list[dict[str, Any]] = []
    for entity in destination_schema.get("entities", []):
        entity_name = entity["entity"]
        mappings: list[dict[str, Any]] = []
        for field in entity.get("fields", []):
            target_field = field["name"]
            target_tokens = _tokenize(target_field)
            best_match = None
            best_score = 0
            for source in source_columns:
                source_tokens = _tokenize(str(source.get("column_name") or ""))
                score = len(target_tokens.intersection(source_tokens))
                if score > best_score:
                    best_score = score
                    best_match = source
            if best_match and best_score > 0:
                mappings.append(
                    {
                        "target_field": target_field,
                        "required": field.get("required", False),
                        "source_field": f"{best_match['table_name']}.{best_match['column_name']}",
                        "transformation": "direct",
                        "confidence": round(min(0.55 + (0.1 * best_score), 0.95), 2),
                        "review_flag": best_score < 2,
                        "confidence_rationale": "Token overlap between destination and source field names.",
                        "staging_reference": best_match["table_name"],
                        "discovery_reference": None,
                        "value_map": None,
                    }
                )
            else:
                mappings.append(
                    {
                        "target_field": target_field,
                        "required": field.get("required", False),
                        "source_field": None,
                        "transformation": "unresolved",
                        "confidence": 0.0,
                        "review_flag": True,
                        "confidence_rationale": "No deterministic source field match found.",
                        "staging_reference": None,
                        "discovery_reference": None,
                        "value_map": None,
                    }
                )
                gaps.append(
                    {
                        "destination_entity": entity_name,
                        "destination_field": target_field,
                        "reason": "No source field match found.",
                    }
                )
        source_table = mappings[0]["source_field"].split(".")[0] if mappings and mappings[0].get("source_field") else None
        entities.append(
            {
                "destination_entity": entity_name,
                "source_table": source_table,
                "join_path": f"FROM {source_table}" if source_table else None,
                "confidence": "low" if any(item["review_flag"] for item in mappings) else "high",
                "fields": mappings,
            }
        )

    return {
        "entities": entities,
        "gaps": gaps,
        "discovery_answers": discovery_answers,
    }


async def run_stage(acquisition_id: UUID, job_id: UUID, db: AsyncSession) -> None:
    acquisition = await get_acquisition(db, acquisition_id)
    await mark_stage_running(db, acquisition)
    job = (await db.execute(select(Job).where(Job.id == job_id))).scalar_one()

    enriched_artifact = await get_latest_artifact_by_type(db, acquisition_id, "enriched_source_schema")
    if not enriched_artifact or not enriched_artifact.content:
        raise ValueError("Stage 2 enriched schema artifact is required before Stage 4")
    answers = await get_discovery_answers(db, acquisition_id)
    destination_schema = load_static_json("cch_axcess_target_schema_v2.json")

    await append_job_log(db, job, "Generating mapping manifest.")
    answer_payload = [
        {
            "question_key": answer.question_key,
            "question_text": answer.question_text,
            "answer": answer.answer,
            "why_blocking": answer.why_blocking,
        }
        for answer in answers
    ]
    try:
        manifest = await call_json_prompt(
            "mapping_engine.md",
            {
                "source_schema": enriched_artifact.content,
                "destination_schema": destination_schema,
                "discovery_answers": answer_payload,
            },
        )
        if not isinstance(manifest, dict):
            raise ValueError("Unexpected manifest response type")
    except Exception:
        manifest = _fallback_manifest(enriched_artifact.content, destination_schema, answer_payload)

    await save_artifact(db, acquisition_id, 4, "mapping_manifest", content=manifest)
    await append_job_log(db, job, f"Manifest generated with {len(manifest.get('entities', []))} destination entities.")
    await finalize_stage(db, acquisition, 4, "awaiting_review")
