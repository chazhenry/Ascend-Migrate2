import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Acquisition(Base):
    __tablename__ = "acquisitions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_system: Mapped[str | None] = mapped_column(String(100), nullable=True)
    source_system_confidence: Mapped[float | None] = mapped_column(Numeric(4, 3), nullable=True)
    current_stage: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    stage_status: Mapped[str] = mapped_column(String(50), nullable=False, default="idle", server_default="idle")
    historical_years: Mapped[int] = mapped_column(Integer, nullable=False, default=3, server_default="3")
    source_db_host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_db_port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_db_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_db_schema: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_db_user: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_db_password: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active", server_default="active")

    creator = relationship("User", back_populates="acquisitions")
    files = relationship("AcquisitionFile", back_populates="acquisition", cascade="all, delete-orphan")
    artifacts = relationship("StageArtifact", back_populates="acquisition", cascade="all, delete-orphan")
    jobs = relationship("Job", back_populates="acquisition", cascade="all, delete-orphan")
    discovery_answers = relationship("DiscoveryAnswer", back_populates="acquisition", cascade="all, delete-orphan")
    manifest_overrides = relationship("ManifestOverride", back_populates="acquisition", cascade="all, delete-orphan")
    research_program = relationship("ResearchProgram", back_populates="acquisition", cascade="all, delete-orphan", uselist=False)
    research_runs = relationship("ResearchRun", back_populates="acquisition", cascade="all, delete-orphan")
