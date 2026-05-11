export interface ApiError {
    detail: string;
    code: string;
}

export interface User {
    id: string;
    email: string;
    name: string;
    role: "admin" | "user";
}

export interface ProjectListItem {
    id: string;
    name: string;
    slug: string;
    status: string;
    created_by: string;
    created_at: string;
    updated_at: string;
}

export interface ProjectDetail extends ProjectListItem {
    config: Record<string, unknown>;
}

export interface DiscoveryQuestionItem {
    key: string;
    prompt: string;
}

export interface DiscoveryQuestionSection {
    category_key: string;
    category_title: string;
    questions: DiscoveryQuestionItem[];
}

export interface DiscoveryQuestionDocument {
    document_name: string;
    sections: DiscoveryQuestionSection[];
}

export interface SqlTemplate {
    name: string;
    content: string;
}

export interface LLMPromptResponse {
    provider: "deepseek" | "openai";
    model: string;
    prompt: string;
    response: string;
}

export interface AuthResponse {
    access_token: string;
    token_type: string;
    user: User;
}

export interface AcquisitionFile {
    id: string;
    acquisition_id: string;
    filename: string;
    file_type: string;
    row_count: number | null;
    file_size_bytes: number;
    storage_path: string;
    uploaded_at: string;
}

export interface Artifact {
    id: string;
    acquisition_id: string;
    stage: number;
    artifact_type: string;
    content: Record<string, unknown> | unknown[] | null;
    file_path: string | null;
    version: number;
    created_at: string;
}

export interface Job {
    id: string;
    acquisition_id: string;
    stage: number;
    status: string;
    log: string;
    started_at: string | null;
    completed_at: string | null;
    triggered_by: string;
}

export interface DiscoveryAnswer {
    id: string;
    acquisition_id: string;
    question_key: string;
    question_text: string;
    why_blocking: string;
    answer: string | null;
    is_required: boolean;
    answered_by: string | null;
    answered_at: string | null;
}

export interface ManifestOverride {
    id: string;
    acquisition_id: string;
    target_entity: string;
    target_field: string;
    original_value: Record<string, unknown> | unknown[];
    override_value: Record<string, unknown> | unknown[];
    overridden_by: string;
    overridden_at: string;
}

export interface AcquisitionListItem {
    id: string;
    name: string;
    source_system: string | null;
    source_system_confidence: number | null;
    current_stage: number;
    stage_status: string;
    historical_years: number;
    updated_at: string;
    status: string;
}

export interface AcquisitionDetail extends AcquisitionListItem {
    source_db_host: string | null;
    source_db_port: number | null;
    source_db_name: string | null;
    source_db_schema: string | null;
    source_db_user: string | null;
    created_by: string;
    created_at: string;
    files: AcquisitionFile[];
    artifacts: Artifact[];
    jobs: Job[];
    discovery_answers: DiscoveryAnswer[];
    manifest_overrides: ManifestOverride[];
}
