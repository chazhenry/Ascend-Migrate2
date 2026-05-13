from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ProjectBase(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=1, max_length=255)
    display_name: str = Field(min_length=1, max_length=200)
    project_slug: str | None = Field(default=None, min_length=1, max_length=40)
    firm_name: str = Field(min_length=1, max_length=200)
    firm_revenue: float | None = None
    firm_staff_count: int | None = None
    firm_office_count: int | None = None
    source_system: str = Field(default="Practice Engine", max_length=40)
    source_db_platform: str | None = Field(default=None, max_length=50)
    databricks_handle: str | None = Field(default=None, max_length=80)
    source_connection: dict[str, Any] | None = None
    destination_system: str = Field(default="CCH Axcess Practice", max_length=100)
    dau_instance_id: str | None = Field(default=None, max_length=50)
    status: str | None = None
    current_step: int | None = None
    wf_template_code: str | None = Field(default=None, max_length=50)
    entities_in_scope: list[Any] = Field(default_factory=list)
    enriched_schema_path_cch: str | None = Field(default=None, max_length=255)
    enriched_schema_path_client: str | None = Field(default=None, max_length=255)
    cycle: int | None = None
    ct_lead: str | None = Field(default=None, max_length=100)
    ascend_contacts: list[Any] = Field(default_factory=list)
    known_risks: list[Any] = Field(default_factory=list)
    notes: str | None = None
    config: dict[str, Any] = Field(default_factory=dict)


class ProjectCreateRequest(ProjectBase):
    pass


class ProjectUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=1, max_length=255)
    display_name: str | None = Field(default=None, min_length=1, max_length=200)
    project_slug: str | None = Field(default=None, min_length=1, max_length=40)
    firm_name: str | None = Field(default=None, min_length=1, max_length=200)
    firm_revenue: float | None = None
    firm_staff_count: int | None = None
    firm_office_count: int | None = None
    source_system: str | None = Field(default=None, max_length=40)
    source_db_platform: str | None = Field(default=None, max_length=50)
    databricks_handle: str | None = Field(default=None, max_length=80)
    source_connection: dict[str, Any] | None = None
    destination_system: str | None = Field(default=None, max_length=100)
    dau_instance_id: str | None = Field(default=None, max_length=50)
    status: str | None = None
    current_step: int | None = None
    wf_template_code: str | None = Field(default=None, max_length=50)
    entities_in_scope: list[Any] | None = None
    enriched_schema_path_cch: str | None = Field(default=None, max_length=255)
    enriched_schema_path_client: str | None = Field(default=None, max_length=255)
    cycle: int | None = None
    ct_lead: str | None = Field(default=None, max_length=100)
    ascend_contacts: list[Any] | None = None
    known_risks: list[Any] | None = None
    notes: str | None = None
    config: dict[str, Any] | None = None


class ProjectListItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str
    display_name: str
    project_slug: str
    firm_name: str
    firm_revenue: float | None = None
    firm_staff_count: int | None = None
    firm_office_count: int | None = None
    source_system: str
    source_db_platform: str | None = None
    databricks_handle: str | None = None
    source_connection: dict[str, Any] | None = None
    destination_system: str
    dau_instance_id: str | None = None
    status: str
    current_step: int | None = None
    wf_template_code: str | None = None
    entities_in_scope: list[Any] = Field(default_factory=list)
    enriched_schema_path_cch: str | None = None
    enriched_schema_path_client: str | None = None
    cycle: int | None = None
    ct_lead: str | None = None
    ascend_contacts: list[Any] = Field(default_factory=list)
    known_risks: list[Any] = Field(default_factory=list)
    notes: str | None = None
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime


class ProjectDetailResponse(ProjectListItemResponse):
    config: dict[str, Any]


class HeuristicsTextRequest(BaseModel):
    content: str


class SqlTemplateResponse(BaseModel):
    name: str
    content: str