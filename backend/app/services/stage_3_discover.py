from collections import defaultdict
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discovery_answer import DiscoveryAnswer
from app.models.job import Job
from app.services.ai import call_json_prompt, load_static_json
from app.services.jobs import append_job_log, save_artifact
from app.services.pipeline import finalize_stage, get_acquisition, get_latest_artifact_by_type, mark_stage_running


def _fallback_questions(enriched_schema: dict[str, Any], destination_schema: dict[str, Any]) -> list[dict[str, Any]]:
    questions: list[dict[str, Any]] = [
        {
            "question_key": "historical_years_scope",
            "question_text": "How many years of historical data should be migrated for transactional entities?",
            "why_blocking": "The extraction date filter depends on this business decision.",
            "category": "historical_scope",
            "is_required": True,
            "input_type": "select",
        }
    ]
    table_names = {table.lower() for table in enriched_schema.keys()}
    if any("staff" in table for table in table_names):
        questions.append(
            {
                "question_key": "staff_crosswalk",
                "question_text": "What is the authoritative crosswalk from source staff identifiers to CCH staff records?",
                "why_blocking": "Time, WIP, AR, and assignment mappings require firm-specific staff IDs.",
                "category": "staff_crosswalk",
                "is_required": True,
                "input_type": "crosswalk_table",
            }
        )
    if any("office" in table or "department" in table for table in table_names):
        questions.append(
            {
                "question_key": "office_mapping_rule",
                "question_text": "How should source office or department values map into the destination office structure?",
                "why_blocking": "Client and engagement ownership fields vary by firm-specific configuration.",
                "category": "entity_type",
                "is_required": True,
                "input_type": "text",
            }
        )
    if any("billing" in table or "invoice" in table for table in table_names):
        questions.append(
            {
                "question_key": "billing_status_crosswalk",
                "question_text": "Which source billing statuses correspond to billable, held, and final states in CCH Axcess Practice?",
                "why_blocking": "Invoice and WIP status mappings are ambiguous without a firm-specific crosswalk.",
                "category": "billing",
                "is_required": True,
                "input_type": "crosswalk_table",
            }
        )
    deduped: dict[str, dict[str, Any]] = {question["question_key"]: question for question in questions}
    return list(deduped.values())


async def _upsert_questions(db: AsyncSession, acquisition_id: UUID, questions: list[dict[str, Any]]) -> None:
    existing_result = await db.execute(select(DiscoveryAnswer).where(DiscoveryAnswer.acquisition_id == acquisition_id))
    existing = {item.question_key: item for item in existing_result.scalars().all()}
    for question in questions:
        record = existing.get(question["question_key"])
        if record:
            record.question_text = question["question_text"]
            record.why_blocking = question["why_blocking"]
            record.is_required = question["is_required"]
        else:
            db.add(
                DiscoveryAnswer(
                    acquisition_id=acquisition_id,
                    question_key=question["question_key"],
                    question_text=question["question_text"],
                    why_blocking=question["why_blocking"],
                    is_required=question["is_required"],
                )
            )
    await db.commit()


async def run_stage(acquisition_id: UUID, job_id: UUID, db: AsyncSession) -> None:
    acquisition = await get_acquisition(db, acquisition_id)
    await mark_stage_running(db, acquisition)
    job = (await db.execute(select(Job).where(Job.id == job_id))).scalar_one()

    artifact = await get_latest_artifact_by_type(db, acquisition_id, "enriched_source_schema")
    if not artifact or not artifact.content:
        raise ValueError("Stage 2 enriched schema artifact is required before Stage 3")

    destination_schema = load_static_json("cch_axcess_target_schema_v2.json")
    await append_job_log(db, job, "Generating blocking discovery questions.")
    try:
        questions = await call_json_prompt(
            "discover_system.md",
            {"source_schema": artifact.content, "destination_schema": destination_schema},
        )
        if not isinstance(questions, list):
            raise ValueError("Unexpected discovery response type")
    except Exception:
        questions = _fallback_questions(artifact.content, destination_schema)

    await _upsert_questions(db, acquisition_id, questions)
    await save_artifact(db, acquisition_id, 3, "discovery_questions", content=questions)
    await append_job_log(db, job, f"Saved {len(questions)} discovery questions.")
    await finalize_stage(db, acquisition, 3, "idle")
