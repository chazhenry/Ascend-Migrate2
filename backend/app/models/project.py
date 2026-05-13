from datetime import datetime

from sqlalchemy import DateTime, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Project(Base):
    __tablename__ = "project"

    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    project_slug: Mapped[str] = mapped_column(String(40), primary_key=True)
    firm_name: Mapped[str] = mapped_column(String(200), nullable=False)
    firm_revenue: Mapped[float | None] = mapped_column(Numeric(15, 2), nullable=True)
    firm_staff_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    firm_office_count: Mapped[int | None] = mapped_column(Integer, nullable=True, default=1, server_default="1")
    source_system: Mapped[str] = mapped_column(String(40), nullable=False, default="Practice Engine", server_default="Practice Engine")
    source_db_platform: Mapped[str | None] = mapped_column(String(50), nullable=True)
    databricks_handle: Mapped[str | None] = mapped_column(String(80), nullable=True)
    source_connection: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    destination_system: Mapped[str] = mapped_column(String(100), nullable=False, default="CCH Axcess Practice", server_default="CCH Axcess Practice")
    dau_instance_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="draft", server_default="draft")
    current_step: Mapped[int | None] = mapped_column(Integer, nullable=True, default=0, server_default="0")
    wf_template_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    entities_in_scope: Mapped[list] = mapped_column(JSONB, nullable=True, default=list, server_default="[]")
    enriched_schema_path_cch: Mapped[str | None] = mapped_column(String(255), nullable=True)
    enriched_schema_path_client: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cycle: Mapped[int | None] = mapped_column(Integer, nullable=True, default=1, server_default="1")
    ct_lead: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ascend_contacts: Mapped[list] = mapped_column(JSONB, nullable=True, default=list, server_default="[]")
    known_risks: Mapped[list] = mapped_column(JSONB, nullable=True, default=list, server_default="[]")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())