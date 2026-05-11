"""initial schema

Revision ID: 20260427_0001
Revises: 
Create Date: 2026-04-27 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260427_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=50), nullable=False, server_default="user"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "acquisitions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("source_system", sa.String(length=100), nullable=True),
        sa.Column("source_system_confidence", sa.Numeric(4, 3), nullable=True),
        sa.Column("current_stage", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("stage_status", sa.String(length=50), nullable=False, server_default="idle"),
        sa.Column("historical_years", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("source_db_host", sa.String(length=255), nullable=True),
        sa.Column("source_db_port", sa.Integer(), nullable=True),
        sa.Column("source_db_name", sa.String(length=255), nullable=True),
        sa.Column("source_db_schema", sa.String(length=255), nullable=True),
        sa.Column("source_db_user", sa.String(length=255), nullable=True),
        sa.Column("source_db_password", sa.Text(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="active"),
    )

    op.create_table(
        "acquisition_files",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("acquisition_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("acquisitions.id"), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("file_type", sa.String(length=50), nullable=False),
        sa.Column("row_count", sa.Integer(), nullable=True),
        sa.Column("file_size_bytes", sa.Integer(), nullable=False),
        sa.Column("storage_path", sa.Text(), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_acquisition_files_acquisition_id", "acquisition_files", ["acquisition_id"], unique=False)

    op.create_table(
        "stage_artifacts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("acquisition_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("acquisitions.id"), nullable=False),
        sa.Column("stage", sa.Integer(), nullable=False),
        sa.Column("artifact_type", sa.String(length=100), nullable=False),
        sa.Column("content", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("file_path", sa.Text(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_stage_artifacts_acquisition_id", "stage_artifacts", ["acquisition_id"], unique=False)

    op.create_table(
        "jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("acquisition_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("acquisitions.id"), nullable=False),
        sa.Column("stage", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="queued"),
        sa.Column("log", sa.Text(), nullable=False, server_default=""),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("triggered_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
    )
    op.create_index("ix_jobs_acquisition_id", "jobs", ["acquisition_id"], unique=False)

    op.create_table(
        "discovery_answers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("acquisition_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("acquisitions.id"), nullable=False),
        sa.Column("question_key", sa.String(length=255), nullable=False),
        sa.Column("question_text", sa.Text(), nullable=False),
        sa.Column("why_blocking", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("is_required", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("answered_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("acquisition_id", "question_key", name="uq_discovery_answer_question"),
    )
    op.create_index("ix_discovery_answers_acquisition_id", "discovery_answers", ["acquisition_id"], unique=False)

    op.create_table(
        "manifest_overrides",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("acquisition_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("acquisitions.id"), nullable=False),
        sa.Column("target_entity", sa.String(length=255), nullable=False),
        sa.Column("target_field", sa.String(length=255), nullable=False),
        sa.Column("original_value", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("override_value", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("overridden_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("overridden_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("acquisition_id", "target_entity", "target_field", name="uq_manifest_override_field"),
    )
    op.create_index("ix_manifest_overrides_acquisition_id", "manifest_overrides", ["acquisition_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_manifest_overrides_acquisition_id", table_name="manifest_overrides")
    op.drop_table("manifest_overrides")
    op.drop_index("ix_discovery_answers_acquisition_id", table_name="discovery_answers")
    op.drop_table("discovery_answers")
    op.drop_index("ix_jobs_acquisition_id", table_name="jobs")
    op.drop_table("jobs")
    op.drop_index("ix_stage_artifacts_acquisition_id", table_name="stage_artifacts")
    op.drop_table("stage_artifacts")
    op.drop_index("ix_acquisition_files_acquisition_id", table_name="acquisition_files")
    op.drop_table("acquisition_files")
    op.drop_table("acquisitions")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
