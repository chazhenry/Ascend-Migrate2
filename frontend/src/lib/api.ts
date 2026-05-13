import axios from "axios";

import { useAuthStore } from "@/stores/authStore";
import type {
    AcquisitionDetail,
    AcquisitionFile,
    AcquisitionListItem,
    ApiError,
    Artifact,
    AuthResponse,
    DiscoveryQuestionDocument,
    DiscoveryAnswer,
    Job,
    LLMPromptResponse,
    ManifestOverride,
    ProjectDetail,
    ProjectListItem,
    ProjectMutationPayload,
    SqlTemplate,
    User,
} from "@/types/api";

const DEFAULT_API_BASE_URL = "/api/v1";

export const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL,
});

const withTokenQuery = (path: string): string => {
    const token = useAuthStore.getState().token;
    const baseUrl = apiClient.defaults.baseURL ?? DEFAULT_API_BASE_URL;
    const resolvedBaseUrl = /^https?:\/\//i.test(baseUrl)
        ? baseUrl
        : new URL(baseUrl, typeof window === "undefined" ? "http://localhost:5180" : window.location.origin).toString();
    const url = new URL(path, resolvedBaseUrl);
    if (token) {
        url.searchParams.set("token", token);
    }
    return url.toString();
};

apiClient.interceptors.request.use((config) => {
    const token = useAuthStore.getState().token;
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export const getApiErrorMessage = (error: unknown): string => {
    if (axios.isAxiosError<ApiError>(error)) {
        return error.response?.data?.detail ?? error.message;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return "Unexpected error";
};

export const authApi = {
    login: async (email: string, password: string): Promise<AuthResponse> => {
        const response = await apiClient.post<AuthResponse>("/auth/login", { email, password });
        return response.data;
    },
    me: async (): Promise<User> => {
        const response = await apiClient.get<User>("/auth/me");
        return response.data;
    },
    logout: async (): Promise<void> => {
        await apiClient.post("/auth/logout");
    },
};

export const acquisitionsApi = {
    list: async (): Promise<AcquisitionListItem[]> => {
        const response = await apiClient.get<AcquisitionListItem[]>("/acquisitions");
        return response.data;
    },
    create: async (payload: Record<string, unknown>): Promise<AcquisitionDetail> => {
        const response = await apiClient.post<AcquisitionDetail>("/acquisitions", payload);
        return response.data;
    },
    detail: async (acquisitionId: string): Promise<AcquisitionDetail> => {
        const response = await apiClient.get<AcquisitionDetail>(`/acquisitions/${acquisitionId}`);
        return response.data;
    },
    update: async (acquisitionId: string, payload: Record<string, unknown>): Promise<AcquisitionDetail> => {
        const response = await apiClient.patch<AcquisitionDetail>(`/acquisitions/${acquisitionId}`, payload);
        return response.data;
    },
    archive: async (acquisitionId: string): Promise<void> => {
        await apiClient.delete(`/acquisitions/${acquisitionId}`);
    },
};

export const projectsApi = {
    list: async (): Promise<ProjectListItem[]> => {
        const response = await apiClient.get<ProjectListItem[]>("/projects");
        return response.data;
    },
    create: async (payload: ProjectMutationPayload): Promise<ProjectDetail> => {
        const response = await apiClient.post<ProjectDetail>("/projects", payload);
        return response.data;
    },
    detail: async (projectId: string): Promise<ProjectDetail> => {
        const response = await apiClient.get<ProjectDetail>(`/projects/${projectId}`);
        return response.data;
    },
    update: async (projectId: string, payload: Partial<ProjectMutationPayload>): Promise<ProjectDetail> => {
        const response = await apiClient.patch<ProjectDetail>(`/projects/${projectId}`, payload);
        return response.data;
    },
    archive: async (projectId: string): Promise<void> => {
        await apiClient.delete(`/projects/${projectId}`);
    },
};

export const filesApi = {
    upload: async (acquisitionId: string, files: File[]): Promise<AcquisitionFile[]> => {
        const formData = new FormData();
        files.forEach((file) => formData.append("files", file));
        const response = await apiClient.post<AcquisitionFile[]>(`/acquisitions/${acquisitionId}/files`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
        });
        return response.data;
    },
    list: async (acquisitionId: string): Promise<AcquisitionFile[]> => {
        const response = await apiClient.get<AcquisitionFile[]>(`/acquisitions/${acquisitionId}/files`);
        return response.data;
    },
    remove: async (acquisitionId: string, fileId: string): Promise<void> => {
        await apiClient.delete(`/acquisitions/${acquisitionId}/files/${fileId}`);
    },
    enrichSchema: async (file: File): Promise<Blob> => {
        const formData = new FormData();
        formData.append("file", file);
        const response = await apiClient.post("/utils/enrich-schema", formData, {
            headers: { "Content-Type": "multipart/form-data" },
            responseType: "blob",
        });
        return response.data;
    },
};

export const stagesApi = {
    run: async (acquisitionId: string, stage: number): Promise<Job> => {
        const response = await apiClient.post<Job>(`/acquisitions/${acquisitionId}/stages/${stage}/run`);
        return response.data;
    },
    status: async (acquisitionId: string, stage: number): Promise<{ stage_status: string; job: Job | null }> => {
        const response = await apiClient.get<{ stage_status: string; job: Job | null }>(
            `/acquisitions/${acquisitionId}/stages/${stage}/status`,
        );
        return response.data;
    },
    artifact: async (acquisitionId: string, stage: number): Promise<Artifact> => {
        const response = await apiClient.get<Artifact>(`/acquisitions/${acquisitionId}/stages/${stage}/artifact`);
        return response.data;
    },
};

export const discoveryApi = {
    list: async (acquisitionId: string): Promise<DiscoveryAnswer[]> => {
        const response = await apiClient.get<DiscoveryAnswer[]>(`/acquisitions/${acquisitionId}/discovery`);
        return response.data;
    },
    update: async (acquisitionId: string, questionKey: string, answer: string): Promise<DiscoveryAnswer> => {
        const response = await apiClient.patch<DiscoveryAnswer>(`/acquisitions/${acquisitionId}/discovery/${questionKey}`, { answer });
        return response.data;
    },
};

export const manifestApi = {
    getManifest: async (acquisitionId: string): Promise<Record<string, unknown>> => {
        const response = await apiClient.get<Record<string, unknown>>(`/acquisitions/${acquisitionId}/manifest`);
        return response.data;
    },
    getOverrides: async (acquisitionId: string): Promise<ManifestOverride[]> => {
        const response = await apiClient.get<ManifestOverride[]>(`/acquisitions/${acquisitionId}/manifest/overrides`);
        return response.data;
    },
    upsertOverride: async (acquisitionId: string, payload: Record<string, unknown>): Promise<ManifestOverride> => {
        const response = await apiClient.put<ManifestOverride>(`/acquisitions/${acquisitionId}/manifest/overrides`, payload);
        return response.data;
    },
};

export const staticSchemasApi = {
    listFiles: async (folder: "cch" | "client" | "heuristics"): Promise<string[]> => {
        const response = await apiClient.get<string[]>(`/utils/static-schemas/${folder}`);
        return response.data;
    },
    getFile: async (folder: "cch" | "client" | "heuristics", filename: string): Promise<unknown> => {
        const response = await apiClient.get<unknown>(`/utils/static-schemas/${folder}/${filename}`);
        return response.data;
    },
};

export const utilitiesApi = {
    discoveryQuestions: async (): Promise<DiscoveryQuestionDocument> => {
        const response = await apiClient.get<DiscoveryQuestionDocument>("/utils/discovery-questions");
        return response.data;
    },
    heuristicsText: async (projectSlug: string): Promise<{ content: string }> => {
        const response = await apiClient.get<{ content: string }>(`/utils/heuristics/${projectSlug}`);
        return response.data;
    },
    saveHeuristicsText: async (projectSlug: string, content: string): Promise<void> => {
        await apiClient.put(`/utils/heuristics/${projectSlug}`, { content });
    },
    sqlTemplate: async (entity: "Contacts" | "Clients" | "Jobs" | "AR" | "WIP"): Promise<SqlTemplate> => {
        const response = await apiClient.get<SqlTemplate>(`/utils/sql-templates/${entity}`);
        return response.data;
    },
};

export const llmApi = {
    prompt: async (prompt: string, provider: "deepseek" | "openai", systemPrompt?: string): Promise<LLMPromptResponse> => {
        const response = await apiClient.post<LLMPromptResponse>("/LLM/prompt", { prompt, provider, system_prompt: systemPrompt ?? null });
        return response.data;
    },
};

export const artifactsApi = {
    list: async (acquisitionId: string): Promise<Artifact[]> => {
        const response = await apiClient.get<Artifact[]>(`/acquisitions/${acquisitionId}/artifacts`);
        return response.data;
    },
    downloadUrl: (acquisitionId: string, artifactId: string): string =>
        withTokenQuery(`/acquisitions/${acquisitionId}/artifacts/${artifactId}/download`),
};

export const pfxApi = {
    status: async (): Promise<Record<string, unknown>> => {
        const response = await apiClient.get<Record<string, unknown>>("/pfx/status");
        return response.data;
    },
    revert: async (): Promise<{ message: string }> => {
        const response = await apiClient.post<{ message: string }>("/pfx/revert");
        return response.data;
    },
    writeTest: async (): Promise<{ message: string; client_row_count: number }> => {
        const response = await apiClient.post<{ message: string; client_row_count: number }>("/pfx/write-test");
        return response.data;
    },
};
