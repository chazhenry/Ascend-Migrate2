from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DBSession
from app.core.errors import APIError
from app.core.security import encrypt_value
from app.models.acquisition import Acquisition
from app.models.discovery_answer import DiscoveryAnswer
from app.models.manifest_override import ManifestOverride
from app.schemas.acquisition import (
    AcquisitionCreateRequest,
    AcquisitionDetailResponse,
    AcquisitionListItemResponse,
    AcquisitionUpdateRequest,
)
from app.schemas.discovery import DiscoveryAnswerResponse, DiscoveryAnswerUpdateRequest
from app.schemas.manifest import ManifestOverrideRequest, ManifestOverrideResponse
from app.schemas.common import MessageResponse
from app.services.pipeline import get_latest_artifact_by_type


router = APIRouter(prefix="/acquisitions", tags=["acquisitions"])


def _apply_acquisition_updates(acquisition: Acquisition, payload: AcquisitionCreateRequest | AcquisitionUpdateRequest) -> None:
    values = payload.model_dump(exclude_unset=True)
    for key, value in values.items():
        if key == "source_db_password" and value:
            setattr(acquisition, key, encrypt_value(value))
        elif value is not None:
            setattr(acquisition, key, value)
    acquisition.updated_at = datetime.now(UTC)


@router.get("", response_model=list[AcquisitionListItemResponse])
async def list_acquisitions(_: CurrentUser, db: DBSession) -> list[AcquisitionListItemResponse]:
    result = await db.execute(
        select(Acquisition)
        .where(Acquisition.status != "archived")
        .order_by(Acquisition.updated_at.desc())
    )
    return [AcquisitionListItemResponse.model_validate(item) for item in result.scalars().all()]


@router.post("", response_model=AcquisitionDetailResponse)
async def create_acquisition(
    payload: AcquisitionCreateRequest,
    user: CurrentUser,
    db: DBSession,
) -> AcquisitionDetailResponse:
    acquisition = Acquisition(created_by=user.id)
    _apply_acquisition_updates(acquisition, payload)
    db.add(acquisition)
    await db.commit()
    await db.refresh(acquisition)
    return await get_acquisition_detail(acquisition.id, user, db)


@router.get("/{acquisition_id}", response_model=AcquisitionDetailResponse)
async def get_acquisition_detail(
    acquisition_id: UUID,
    _: CurrentUser,
    db: DBSession,
) -> AcquisitionDetailResponse:
    result = await db.execute(
        select(Acquisition)
        .options(
            selectinload(Acquisition.files),
            selectinload(Acquisition.artifacts),
            selectinload(Acquisition.jobs),
            selectinload(Acquisition.discovery_answers),
            selectinload(Acquisition.manifest_overrides),
        )
        .where(Acquisition.id == acquisition_id)
    )
    acquisition = result.scalar_one_or_none()
    if not acquisition:
        raise APIError("Acquisition not found.", "acquisition_not_found", 404)
    return AcquisitionDetailResponse.model_validate(acquisition)


@router.patch("/{acquisition_id}", response_model=AcquisitionDetailResponse)
async def update_acquisition(
    acquisition_id: UUID,
    payload: AcquisitionUpdateRequest,
    user: CurrentUser,
    db: DBSession,
) -> AcquisitionDetailResponse:
    result = await db.execute(select(Acquisition).where(Acquisition.id == acquisition_id))
    acquisition = result.scalar_one_or_none()
    if not acquisition:
        raise APIError("Acquisition not found.", "acquisition_not_found", 404)
    _apply_acquisition_updates(acquisition, payload)
    await db.commit()
    return await get_acquisition_detail(acquisition_id, user, db)


@router.delete("/{acquisition_id}", response_model=MessageResponse)
async def archive_acquisition(acquisition_id: UUID, _: CurrentUser, db: DBSession) -> MessageResponse:
    result = await db.execute(select(Acquisition).where(Acquisition.id == acquisition_id))
    acquisition = result.scalar_one_or_none()
    if not acquisition:
        raise APIError("Acquisition not found.", "acquisition_not_found", 404)
    acquisition.status = "archived"
    acquisition.updated_at = datetime.now(UTC)
    await db.commit()
    return MessageResponse(detail="Acquisition archived.", code="archived")


@router.get("/{acquisition_id}/discovery", response_model=list[DiscoveryAnswerResponse])
async def list_discovery_answers(acquisition_id: UUID, _: CurrentUser, db: DBSession) -> list[DiscoveryAnswerResponse]:
    result = await db.execute(
        select(DiscoveryAnswer)
        .where(DiscoveryAnswer.acquisition_id == acquisition_id)
        .order_by(DiscoveryAnswer.question_key.asc())
    )
    return [DiscoveryAnswerResponse.model_validate(item) for item in result.scalars().all()]


@router.patch("/{acquisition_id}/discovery/{question_key}", response_model=DiscoveryAnswerResponse)
async def update_discovery_answer(
    acquisition_id: UUID,
    question_key: str,
    payload: DiscoveryAnswerUpdateRequest,
    user: CurrentUser,
    db: DBSession,
) -> DiscoveryAnswerResponse:
    result = await db.execute(
        select(DiscoveryAnswer).where(
            DiscoveryAnswer.acquisition_id == acquisition_id,
            DiscoveryAnswer.question_key == question_key,
        )
    )
    answer = result.scalar_one_or_none()
    if not answer:
        raise APIError("Discovery question not found.", "discovery_question_not_found", 404)
    answer.answer = payload.answer
    answer.answered_by = user.id
    answer.answered_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(answer)
    return DiscoveryAnswerResponse.model_validate(answer)


@router.get("/{acquisition_id}/manifest", response_model=dict)
async def get_manifest(acquisition_id: UUID, _: CurrentUser, db: DBSession) -> dict:
    artifact = await get_latest_artifact_by_type(db, acquisition_id, "mapping_manifest")
    if not artifact or artifact.content is None:
        raise APIError("Mapping manifest not found.", "manifest_not_found", 404)
    return artifact.content


@router.get("/{acquisition_id}/manifest/overrides", response_model=list[ManifestOverrideResponse])
async def list_manifest_overrides(acquisition_id: UUID, _: CurrentUser, db: DBSession) -> list[ManifestOverrideResponse]:
    result = await db.execute(
        select(ManifestOverride)
        .where(ManifestOverride.acquisition_id == acquisition_id)
        .order_by(ManifestOverride.overridden_at.desc())
    )
    return [ManifestOverrideResponse.model_validate(item) for item in result.scalars().all()]


@router.put("/{acquisition_id}/manifest/overrides", response_model=ManifestOverrideResponse)
async def upsert_manifest_override(
    acquisition_id: UUID,
    payload: ManifestOverrideRequest,
    user: CurrentUser,
    db: DBSession,
) -> ManifestOverrideResponse:
    result = await db.execute(
        select(ManifestOverride).where(
            ManifestOverride.acquisition_id == acquisition_id,
            ManifestOverride.target_entity == payload.target_entity,
            ManifestOverride.target_field == payload.target_field,
        )
    )
    override = result.scalar_one_or_none()
    if override:
        override.original_value = payload.original_value
        override.override_value = payload.override_value
        override.overridden_by = user.id
        override.overridden_at = datetime.now(UTC)
    else:
        override = ManifestOverride(
            acquisition_id=acquisition_id,
            target_entity=payload.target_entity,
            target_field=payload.target_field,
            original_value=payload.original_value,
            override_value=payload.override_value,
            overridden_by=user.id,
        )
        db.add(override)
    await db.commit()
    await db.refresh(override)
    return ManifestOverrideResponse.model_validate(override)
