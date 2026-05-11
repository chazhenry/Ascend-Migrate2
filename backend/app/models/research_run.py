import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ResearchRun(Base):
    __tablename__ = "research_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    acquisition_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("acquisitions.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="queued", server_default="queued")
    goal: Mapped[str | None] = mapped_column(Text, nullable=True)
    max_iterations: Mapped[int] = mapped_column(Integer, nullable=False, default=10, server_default="10")
    current_iteration: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    target_metrics_artifact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    source_schema_artifact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    program_override: Mapped[str | None] = mapped_column(Text, nullable=True)
    best_experiment_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    best_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    triggered_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    acquisition = relationship("Acquisition", back_populates="research_runs")
    experiments = relationship("ResearchExperiment", back_populates="run", cascade="all, delete-orphan")
