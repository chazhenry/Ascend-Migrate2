"""research scaffold

Revision ID: 20260509_0002
Revises: 20260427_0001
Create Date: 2026-05-09 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260509_0002"
down_revision = "20260427_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "research_programs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("acquisition_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("acquisitions.id"), nullable=False),
        sa.Column("goal", sa.Text(), nullable=True),
        sa.Column("constraints", sa.Text(), nullable=True),
        sa.Column("prompt_template", sa.Text(), nullable=True),
        sa.Column("scoring_config", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("model_settings", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("acquisition_id", name="uq_research_program_acquisition"),
    )
    op.create_index("ix_research_programs_acquisition_id", "research_programs", ["acquisition_id"], unique=True)

    op.create_table(
        "research_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("acquisition_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("acquisitions.id"), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="queued"),
        sa.Column("goal", sa.Text(), nullable=True),
        sa.Column("max_iterations", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("current_iteration", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("target_metrics_artifact_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source_schema_artifact_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("model_name", sa.String(length=255), nullable=True),
        sa.Column("program_override", sa.Text(), nullable=True),
        sa.Column("best_experiment_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("best_score", sa.Float(), nullable=True),
        sa.Column("triggered_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_research_runs_acquisition_id", "research_runs", ["acquisition_id"], unique=False)

    op.create_table(
        "research_experiments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("research_runs.id"), nullable=False),
        sa.Column("iteration", sa.Integer(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="queued"),
        sa.Column("prompt_text", sa.Text(), nullable=True),
        sa.Column("sql_text", sa.Text(), nullable=True),
        sa.Column("execution_summary", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("metrics_expected", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("metrics_observed", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("score_breakdown", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("error_text", sa.Text(), nullable=True),
        sa.Column("accepted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_research_experiments_run_id", "research_experiments", ["run_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_research_experiments_run_id", table_name="research_experiments")
    op.drop_table("research_experiments")
    op.drop_index("ix_research_runs_acquisition_id", table_name="research_runs")
    op.drop_table("research_runs")
    op.drop_index("ix_research_programs_acquisition_id", table_name="research_programs")
    op.drop_table("research_programs")