import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ManifestOverride(Base):
    __tablename__ = "manifest_overrides"
    __table_args__ = (UniqueConstraint("acquisition_id", "target_entity", "target_field", name="uq_manifest_override_field"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    acquisition_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("acquisitions.id"), nullable=False, index=True)
    target_entity: Mapped[str] = mapped_column(String(255), nullable=False)
    target_field: Mapped[str] = mapped_column(String(255), nullable=False)
    original_value: Mapped[dict | list] = mapped_column(JSONB, nullable=False)
    override_value: Mapped[dict | list] = mapped_column(JSONB, nullable=False)
    overridden_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    overridden_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    acquisition = relationship("Acquisition", back_populates="manifest_overrides")
