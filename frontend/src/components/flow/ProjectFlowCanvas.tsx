import { isValidElement, useEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Background,
    Controls,
    Handle,
    MarkerType,
    Position,
    ReactFlow,
    type Edge,
    type Node,
    type NodeProps,
    type ReactFlowInstance,
} from "@xyflow/react";
import { ArrowRight, ChevronDown, Copy, FolderOpen, LoaderCircle, MessageSquareText, Moon, Pencil, Play, Plus, Settings2, Sun, ThumbsDown, ThumbsUp, Trash2, UserRound, X } from "lucide-react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import "@xyflow/react/dist/style.css";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { JsonEditor } from "@/components/ui/json-editor";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage, llmApi, pfxApi, projectsApi, staticSchemasApi, utilitiesApi } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { useAuthStore } from "@/stores/authStore";
import type { DiscoveryQuestionDocument, LLMPromptResponse, ProjectDetail, ProjectListItem, ProjectMutationPayload, SqlTemplate, User } from "@/types/api";

const THEME_STORAGE_KEY = "project-migrate-theme";
const LLM_PROVIDER_STORAGE_KEY = "project-migrate-llm-provider";
const CURRENT_PROJECT_STORAGE_KEY = "project-migrate-current-project-id";
const CHAT_PROMPT_HISTORY_STORAGE_KEY = "project-migrate-chat-prompt-history";
const CHAT_PROMPT_HISTORY_LIMIT = 50;

type ThemeMode = "light" | "dark";
type LlmProvider = "deepseek" | "openai";
type StepId = "step-1" | "step-2" | "step-3" | "step-4" | "step-5" | "step-6" | "step-7" | "step-8";

interface FlowStepData extends Record<string, unknown> {
    step: string;
    title: string;
    summary: string;
    output: string;
    accentClassName: string;
    configured: boolean;
    configuredLabel?: string;
    onOpen: (stepId: StepId) => void;
    loopRunning?: boolean;
    onStopLoop?: () => void;
    loopCount?: string;
    selectedScopes?: string[];
}

interface StoredJsonDocument {
    fileName: string;
    content: unknown;
}

interface DiscoveryAnswersConfig {
    answers: Record<string, string>;
}

interface HeuristicsConfig {
    fileName?: string;
    content?: string;
}

interface DbCredentials {
    host?: string;
    port?: string;
    database?: string;
    schema?: string;
    user?: string;
    password?: string;
}

interface DbSetupConfig {
    client: DbCredentials;
    staging: DbCredentials;
}

interface TargetsConfig {
    selectedEntities?: string[];
    arBalance?: string;
    wipBalance?: string;
    clientCount?: string;
    revenueByPeriod?: string;
}

interface SqlSelectionConfig {
    selectedTemplates: string[];
}

interface GenTestLoopConfig {
    objective?: string;
    scoringNotes?: string;
    loopBudget?: string;
    loopCount?: string;
}

interface ProjectConfig {
    dbSchema?: {
        cchSchema?: StoredJsonDocument;
        clientSchema?: StoredJsonDocument;
    };
    discovery?: DiscoveryAnswersConfig;
    heuristics?: HeuristicsConfig;
    dbSetup?: DbSetupConfig;
    targets?: TargetsConfig;
    sql?: SqlSelectionConfig;
    genTestLoop?: GenTestLoopConfig;
}

type FlowCanvasNode = Node<FlowStepData, "pipeline">;

interface StepTemplate {
    id: StepId;
    step: string;
    title: string;
    summary: string;
    output: string;
    accentClassName: string;
    position: { x: number; y: number };
}

interface ModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    project: ProjectDetail | null;
    projectConfig: ProjectConfig;
    onSaveConfig: (config: ProjectConfig, projectFields?: Partial<ProjectMutationPayload>) => Promise<void>;
    onExecute?: () => void;
}

interface ProjectModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    projects: ProjectListItem[];
    currentProject: ProjectDetail | null;
    onSelectProject: (projectId: string) => void;
    onCreateProject: (payload: ProjectMutationPayload) => Promise<void>;
    onUpdateProject: (projectId: string, payload: Partial<ProjectMutationPayload>) => Promise<void>;
    onDeleteProject: (projectId: string) => Promise<void>;
}

interface ProjectDefinitionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: "create" | "edit";
    initialProject?: ProjectListItem | ProjectDetail | null;
    onSubmit: (payload: ProjectMutationPayload | Partial<ProjectMutationPayload>) => Promise<void>;
}

interface ProjectFormState {
    display_name: string;
    project_slug: string;
    firm_name: string;
    firm_revenue: string;
    firm_staff_count: string;
    firm_office_count: string;
    source_system: string;
    source_db_platform: string;
    databricks_handle: string;
    source_connection: string;
    destination_system: string;
    dau_instance_id: string;
    status: string;
    current_step: string;
    wf_template_code: string;
    entities_in_scope: string;
    cycle: string;
    ct_lead: string;
    ascend_contacts: string;
    known_risks: string;
    notes: string;
}

interface SchemaFileState {
    fileName: string;
    value: unknown;
    text: string;
}

interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    model?: string;
}

type ChatReaction = "up" | "down";

type SchemaTabKey = "cchSchema" | "clientSchema";

const flowSteps: StepTemplate[] = [
    {
        id: "step-1",
        step: "01",
        title: "Project",
        summary: "Create a new project or load an existing project workspace.",
        output: "Active project context",
        accentClassName: "bg-slate-900",
        position: { x: 40, y: 90 },
    },
    {
        id: "step-2",
        step: "02",
        title: "DB Schema",
        summary: "Configure, enrich, review, and edit the CCH and Client schema files.",
        output: "Reviewed schema pair",
        accentClassName: "bg-orange-500",
        position: { x: 402, y: 90 },
    },
    {
        id: "step-3",
        step: "03",
        title: "Client Discovery",
        summary: "Collect structured discovery answers through a section-by-section wizard.",
        output: "Discovery answer set",
        accentClassName: "bg-emerald-500",
        position: { x: 764, y: 90 },
    },
    {
        id: "step-4",
        step: "04",
        title: "Heuristics",
        summary: "Edit the project heuristics plain-text instructions used by downstream automation.",
        output: "Project heuristics text",
        accentClassName: "bg-sky-500",
        position: { x: 1126, y: 90 },
    },
    {
        id: "step-5",
        step: "05",
        title: "Client DB Setup",
        summary: "Capture the client-system and staging Postgres connection details.",
        output: "Client and staging DB config",
        accentClassName: "bg-fuchsia-500",
        position: { x: 40, y: 520 },
    },
    {
        id: "step-6",
        step: "06",
        title: "Targets",
        summary: "Set the target balances and counts used for reconciliation.",
        output: "Target value set",
        accentClassName: "bg-rose-500",
        position: { x: 402, y: 520 },
    },
    {
        id: "step-7",
        step: "07",
        title: "SQL",
        summary: "Review the SQL template files and mark the ones to execute later.",
        output: "Selected SQL templates",
        accentClassName: "bg-red-500",
        position: { x: 764, y: 520 },
    },
    {
        id: "step-8",
        step: "08",
        title: "Gen-Test-Loop",
        summary: "Configure the autonomous loop that generates SQL, runs it, and scores the result.",
        output: "Loop control settings",
        accentClassName: "bg-blue-600",
        position: { x: 1126, y: 520 },
    },
];

interface TargetEntityDefinition {
    order: number;
    entity: string;
    reason: string;
    dependencies: string[];
}

const targetEntityDefinitions: TargetEntityDefinition[] = [
    { order: 1, entity: "Client", reason: "All other entities reference Client ID", dependencies: [] },
    { order: 2, entity: "Contacts (CCIU)", reason: "Referenced by invoice/statement routing", dependencies: ["Client"] },
    { order: 3, entity: "Client Primary Contact Info", reason: "Sets primary types after contacts exist", dependencies: ["Contacts (CCIU)"] },
    { order: 4, entity: "Client Billing General Info", reason: "Billing config before transactions", dependencies: ["Client"] },
    { order: 5, entity: "Address Invoice and Statements", reason: "References contacts", dependencies: ["Contacts (CCIU)", "Client Billing General Info"] },
    { order: 6, entity: "Client Email Invoices", reason: "Email routing after billing config", dependencies: ["Client Billing General Info"] },
    { order: 7, entity: "Contact Email Invoices", reason: "Contact-level email routing", dependencies: ["Contacts (CCIU)", "Client Billing General Info"] },
    { order: 8, entity: "Client Custom Field Values", reason: "After client exists", dependencies: ["Client"] },
    { order: 9, entity: "Billing Group Creation", reason: "Groups must exist before assignments", dependencies: [] },
    { order: 10, entity: "Billing Group Renames", reason: "Rename existing groups if needed", dependencies: ["Billing Group Creation"] },
    { order: 11, entity: "Billing Group Assignments", reason: "After groups and clients exist", dependencies: ["Billing Group Creation", "Client"] },
    { order: 12, entity: "Client Group Creation", reason: "Groups must exist before assignments", dependencies: [] },
    { order: 13, entity: "Client Group Assignments", reason: "After groups and clients exist", dependencies: ["Client Group Creation", "Client"] },
    { order: 14, entity: "AR", reason: "Transaction data after client setup", dependencies: ["Client"] },
    { order: 15, entity: "WIP", reason: "Transaction data after client setup", dependencies: ["Client"] },
];

const targetEntityLookup = new Map(targetEntityDefinitions.map((item) => [item.entity, item]));

const initialEdges: Edge[] = [
    { id: "e1-2", source: "step-1", target: "step-2", sourceHandle: "right", targetHandle: "left", markerEnd: { type: MarkerType.ArrowClosed } },
    { id: "e2-3", source: "step-2", target: "step-3", sourceHandle: "right", targetHandle: "left", markerEnd: { type: MarkerType.ArrowClosed } },
    { id: "e3-4", source: "step-3", target: "step-4", sourceHandle: "right", targetHandle: "left", markerEnd: { type: MarkerType.ArrowClosed } },
    { id: "e4-5", source: "step-4", target: "step-5", sourceHandle: "bottom-source", targetHandle: "top", markerEnd: { type: MarkerType.ArrowClosed }, type: "smoothstep" },
    { id: "e5-6", source: "step-5", target: "step-6", sourceHandle: "right", targetHandle: "left", markerEnd: { type: MarkerType.ArrowClosed } },
    { id: "e6-7", source: "step-6", target: "step-7", sourceHandle: "right", targetHandle: "left", markerEnd: { type: MarkerType.ArrowClosed } },
    { id: "e7-8", source: "step-7", target: "step-8", sourceHandle: "right", targetHandle: "left", markerEnd: { type: MarkerType.ArrowClosed } },
    { id: "e8-7-loop", source: "step-8", target: "step-7", sourceHandle: "bottom-source", targetHandle: "bottom-target", markerEnd: { type: MarkerType.ArrowClosed }, type: "smoothstep" },
];

const buildDemoUser = (name: string, email: string): User => ({
    id: `demo-${Date.now()}`,
    email,
    name,
    role: "admin",
});

const toSchemaFileState = (filename: string, parsedJson: unknown): SchemaFileState => ({
    fileName: filename,
    value: parsedJson,
    text: JSON.stringify(parsedJson, null, 2),
});

const readStoredProjectId = (): string | null => {
    if (typeof window === "undefined") {
        return null;
    }
    return window.localStorage.getItem(CURRENT_PROJECT_STORAGE_KEY);
};

const readStoredPromptHistory = (): string[] => {
    if (typeof window === "undefined") {
        return [];
    }
    const raw = window.localStorage.getItem(CHAT_PROMPT_HISTORY_STORAGE_KEY);
    if (!raw) {
        return [];
    }
    try {
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
    } catch {
        return [];
    }
};

const createEmptyProjectForm = (): ProjectFormState => ({
    display_name: "",
    project_slug: "",
    firm_name: "",
    firm_revenue: "",
    firm_staff_count: "",
    firm_office_count: "1",
    source_system: "Practice Engine",
    source_db_platform: "",
    databricks_handle: "",
    source_connection: "{}",
    destination_system: "CCH Axcess Practice",
    dau_instance_id: "",
    status: "draft",
    current_step: "0",
    wf_template_code: "",
    entities_in_scope: "[]",
    cycle: "1",
    ct_lead: "",
    ascend_contacts: "[]",
    known_risks: "[]",
    notes: "",
});

const projectToFormState = (project?: ProjectListItem | ProjectDetail | null): ProjectFormState => ({
    display_name: project?.display_name ?? project?.name ?? "",
    project_slug: project?.project_slug ?? project?.slug ?? "",
    firm_name: project?.firm_name ?? "",
    firm_revenue: project?.firm_revenue != null ? String(project.firm_revenue) : "",
    firm_staff_count: project?.firm_staff_count != null ? String(project.firm_staff_count) : "",
    firm_office_count: project?.firm_office_count != null ? String(project.firm_office_count) : "1",
    source_system: project?.source_system ?? "Practice Engine",
    source_db_platform: project?.source_db_platform ?? "",
    databricks_handle: project?.databricks_handle ?? "",
    source_connection: JSON.stringify(project?.source_connection ?? {}, null, 2),
    destination_system: project?.destination_system ?? "CCH Axcess Practice",
    dau_instance_id: project?.dau_instance_id ?? "",
    status: project?.status ?? "draft",
    current_step: project?.current_step != null ? String(project.current_step) : "0",
    wf_template_code: project?.wf_template_code ?? "",
    entities_in_scope: JSON.stringify(project?.entities_in_scope ?? [], null, 2),
    cycle: project?.cycle != null ? String(project.cycle) : "1",
    ct_lead: project?.ct_lead ?? "",
    ascend_contacts: JSON.stringify(project?.ascend_contacts ?? [], null, 2),
    known_risks: JSON.stringify(project?.known_risks ?? [], null, 2),
    notes: project?.notes ?? "",
});

const parseOptionalNumber = (value: string): number | null => {
    const trimmed = value.trim();
    return trimmed ? Number(trimmed) : null;
};

const parseJsonValue = (label: string, value: string, fallback: unknown): unknown => {
    const trimmed = value.trim();
    if (!trimmed) {
        return fallback;
    }
    try {
        return JSON.parse(trimmed) as unknown;
    } catch {
        throw new Error(`${label} must be valid JSON.`);
    }
};

const buildProjectPayload = (form: ProjectFormState, config: Record<string, unknown> = {}): ProjectMutationPayload => {
    const sourceConnection = parseJsonValue("Source Connection", form.source_connection, {});
    const entitiesInScope = parseJsonValue("Entities In Scope", form.entities_in_scope, []);
    const ascendContacts = parseJsonValue("Ascend Contacts", form.ascend_contacts, []);
    const knownRisks = parseJsonValue("Known Risks", form.known_risks, []);

    if (!form.display_name.trim()) {
        throw new Error("Display Name is required.");
    }
    if (!form.firm_name.trim()) {
        throw new Error("Firm Name is required.");
    }
    if (!Array.isArray(entitiesInScope)) {
        throw new Error("Entities In Scope must be a JSON array.");
    }
    if (!Array.isArray(ascendContacts)) {
        throw new Error("Ascend Contacts must be a JSON array.");
    }
    if (!Array.isArray(knownRisks)) {
        throw new Error("Known Risks must be a JSON array.");
    }
    if (sourceConnection !== null && (typeof sourceConnection !== "object" || Array.isArray(sourceConnection))) {
        throw new Error("Source Connection must be a JSON object.");
    }

    return {
        display_name: form.display_name.trim(),
        project_slug: form.project_slug.trim() || undefined,
        firm_name: form.firm_name.trim(),
        firm_revenue: parseOptionalNumber(form.firm_revenue),
        firm_staff_count: parseOptionalNumber(form.firm_staff_count),
        firm_office_count: parseOptionalNumber(form.firm_office_count),
        source_system: form.source_system.trim() || "Practice Engine",
        source_db_platform: form.source_db_platform.trim() || null,
        databricks_handle: form.databricks_handle.trim() || null,
        source_connection: sourceConnection as Record<string, unknown>,
        destination_system: form.destination_system.trim() || "CCH Axcess Practice",
        dau_instance_id: form.dau_instance_id.trim() || null,
        status: form.status.trim() || "draft",
        current_step: parseOptionalNumber(form.current_step),
        wf_template_code: form.wf_template_code.trim() || null,
        entities_in_scope: entitiesInScope as unknown[],
        cycle: parseOptionalNumber(form.cycle),
        ct_lead: form.ct_lead.trim() || null,
        ascend_contacts: ascendContacts as unknown[],
        known_risks: knownRisks as unknown[],
        notes: form.notes.trim() || null,
        config,
    };
};

const formatProjectRevenue = (project: ProjectListItem): string => (project.firm_revenue != null ? project.firm_revenue.toLocaleString() : "-");

const buildSchemaStoragePath = (folder: "cch" | "client", fileName?: string): string | null => {
    if (!fileName) {
        return null;
    }
    return `${folder === "cch" ? "CCH_schema" : "Client_schema"}/${fileName}`;
};

const getNodeText = (node: ReactNode): string => {
    if (typeof node === "string" || typeof node === "number") {
        return String(node);
    }
    if (Array.isArray(node)) {
        return node.map(getNodeText).join("");
    }
    if (isValidElement(node)) {
        return getNodeText(node.props.children as ReactNode);
    }
    return "";
};

const normalizeProjectConfig = (raw: Record<string, unknown> | undefined): ProjectConfig => (raw ?? {}) as ProjectConfig;

const isDbSchemaConfigured = (config: ProjectConfig): boolean => Boolean(config.dbSchema?.cchSchema && config.dbSchema?.clientSchema);
const isDiscoveryConfigured = (config: ProjectConfig): boolean => Object.values(config.discovery?.answers ?? {}).some((value) => value.trim().length > 0);
const isHeuristicsConfigured = (config: ProjectConfig): boolean => Boolean(config.heuristics?.fileName);
const isDbSetupConfigured = (config: ProjectConfig): boolean => Boolean(config.dbSetup?.client?.host && config.dbSetup?.staging?.host);
const isTargetsConfigured = (config: ProjectConfig): boolean => (config.targets?.selectedEntities?.length ?? 0) > 0;
const isSqlConfigured = (config: ProjectConfig): boolean => (config.sql?.selectedTemplates?.length ?? 0) > 0;
const isLoopConfigured = (config: ProjectConfig): boolean => Boolean(config.genTestLoop?.objective || config.genTestLoop?.scoringNotes || config.genTestLoop?.loopBudget);

const sortSelectedTargetEntities = (entities: string[]): string[] => targetEntityDefinitions
    .filter((item) => entities.includes(item.entity))
    .map((item) => item.entity);

const collectTargetDependencies = (entity: string, collected = new Set<string>()): Set<string> => {
    const definition = targetEntityLookup.get(entity);
    if (!definition) {
        return collected;
    }

    for (const dependency of definition.dependencies) {
        if (!collected.has(dependency)) {
            collected.add(dependency);
            collectTargetDependencies(dependency, collected);
        }
    }

    return collected;
};

const collectDependentTargets = (entity: string, selected: string[], collected = new Set<string>()): Set<string> => {
    for (const definition of targetEntityDefinitions) {
        if (!selected.includes(definition.entity) || collected.has(definition.entity)) {
            continue;
        }

        if (definition.dependencies.includes(entity)) {
            collected.add(definition.entity);
            collectDependentTargets(definition.entity, selected, collected);
        }
    }

    return collected;
};

const getConfiguredCount = (project: ProjectDetail | null): number => {
    if (!project) {
        return 0;
    }
    const config = normalizeProjectConfig(project.config);
    return [
        true,
        isDbSchemaConfigured(config),
        isDiscoveryConfigured(config),
        isHeuristicsConfigured(config),
        isDbSetupConfigured(config),
        isTargetsConfigured(config),
        isSqlConfigured(config),
        isLoopConfigured(config),
    ].filter(Boolean).length;
};

const PipelineNode = ({ data }: NodeProps<FlowCanvasNode>): JSX.Element => {
    const nodeData = data as FlowStepData;
    const isRunning = (nodeData.step === "08" || nodeData.step === "07") && Boolean(nodeData.loopRunning);
    const isLoopControlNode = nodeData.step === "08";

    return (
        <>
            <Handle id="top" type="target" position={Position.Top} className="!h-3 !w-3 !border-2 !border-white !bg-slate-900" />
            <Handle id="left" type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-white !bg-slate-900" />
            <Handle id="bottom-target" type="target" position={Position.Bottom} className="!h-3 !w-3 !border-2 !border-white !bg-slate-900" />
            <div
                role="button"
                tabIndex={0}
                className={`flex h-[264px] w-[312px] cursor-pointer flex-col rounded-lg bg-card p-3 transition focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600 ${isRunning
                    ? "marching-ants"
                    : "border border-border shadow-panel hover:border-slate-400 hover:shadow-[0_12px_28px_rgba(15,23,42,0.12)] dark:hover:border-slate-500"
                    }`}
                onClick={() => nodeData.onOpen(nodeData.id as StepId)}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        nodeData.onOpen(nodeData.id as StepId);
                    }
                }}
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500 dark:text-slate-400">{nodeData.step}</p>
                            <h3 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">{nodeData.title}</h3>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{nodeData.summary}</p>
                    </div>
                    {isRunning ? (
                        <div className="flex shrink-0 items-center gap-1.5">
                            <LoaderCircle className="h-4 w-4 animate-spin text-blue-500" />
                        </div>
                    ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                    <Badge variant={nodeData.configured ? "success" : "warning"}>{nodeData.configured ? (nodeData.configuredLabel ?? "Configured") : "Needs input"}</Badge>
                    {isRunning ? <Badge variant="info">Running</Badge> : null}
                    {isLoopControlNode && nodeData.loopCount ? <Badge variant="outline">Loops: {nodeData.loopCount}</Badge> : null}
                </div>
                {nodeData.selectedScopes && nodeData.selectedScopes.length > 0 ? (
                    <div className="mt-3 flex min-h-0 flex-1 flex-wrap content-start gap-1 overflow-hidden">
                        {nodeData.selectedScopes.slice(0, 8).map((scope) => (
                            <span key={scope} className="inline-flex items-center rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-300">{scope}</span>
                        ))}
                        {nodeData.selectedScopes.length > 8 ? (
                            <span className="inline-flex items-center rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">+{nodeData.selectedScopes.length - 8} more</span>
                        ) : null}
                    </div>
                ) : null}
                <div className="mt-auto rounded-md border border-border bg-background p-2.5 text-xs text-mutedForeground">
                    <p className="font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Output</p>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-100">{nodeData.output}</p>
                </div>
                {isRunning && isLoopControlNode ? (
                    <div className="mt-2 flex justify-end">
                        <Button
                            size="sm"
                            variant="destructive"
                            onClick={(event) => {
                                event.stopPropagation();
                                nodeData.onStopLoop?.();
                            }}
                        >
                            Stop
                        </Button>
                    </div>
                ) : null}
            </div>
            <Handle id="right" type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-white !bg-slate-900" />
            <Handle id="bottom-source" type="source" position={Position.Bottom} className="!h-3 !w-3 !border-2 !border-white !bg-slate-900" />
        </>
    );
};

const ChatActionBar = ({
    reaction,
    onCopy,
    onThumbsUp,
    onThumbsDown,
    className,
}: {
    reaction?: ChatReaction;
    onCopy: () => void;
    onThumbsUp: () => void;
    onThumbsDown: () => void;
    className?: string;
}): JSX.Element => (
    <div className={`absolute bottom-0 right-3 z-10 flex -translate-y-1/2 items-center gap-1 rounded-full border border-border bg-card/95 p-1 shadow-panel backdrop-blur ${className ?? ""}`}>
        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={onCopy} aria-label="Copy response">
            <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 rounded-full ${reaction === "up" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" : ""}`}
            onClick={onThumbsUp}
            aria-label="Thumbs up"
        >
            <ThumbsUp className="h-3.5 w-3.5" />
        </Button>
        <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 rounded-full ${reaction === "down" ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" : ""}`}
            onClick={onThumbsDown}
            aria-label="Thumbs down"
        >
            <ThumbsDown className="h-3.5 w-3.5" />
        </Button>
    </div>
);

const AssistantMarkdown = ({
    messageId,
    content,
    reactions,
    onCopy,
    onReact,
}: {
    messageId: string;
    content: string;
    reactions: Record<string, ChatReaction | undefined>;
    onCopy: (value: string) => void;
    onReact: (targetId: string, reaction: ChatReaction) => void;
}): JSX.Element => {
    let codeBlockIndex = 0;

    return (
        <div className="relative pb-6 prose prose-sm max-w-none text-slate-700 dark:prose-invert dark:text-slate-100">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    pre: ({ children, ...props }) => {
                        const codeIndex = codeBlockIndex;
                        codeBlockIndex += 1;
                        const codeText = getNodeText(children).replace(/\n$/, "");
                        const reactionKey = `${messageId}:code:${codeIndex}`;

                        return (
                            <div className="relative mb-6 overflow-hidden rounded-md border border-border bg-slate-950 text-slate-100">
                                <div className="border-b border-slate-800 px-3 py-2 text-[11px] uppercase tracking-[0.24em] text-slate-400">Code</div>
                                <pre className="overflow-auto p-4 text-xs leading-6" {...props}>{children}</pre>
                                <ChatActionBar
                                    className="border-slate-700 bg-slate-950/95 text-slate-100"
                                    reaction={reactions[reactionKey]}
                                    onCopy={() => onCopy(codeText)}
                                    onThumbsUp={() => onReact(reactionKey, "up")}
                                    onThumbsDown={() => onReact(reactionKey, "down")}
                                />
                            </div>
                        );
                    },
                    code: ({ className, children, ...props }) => <code className={className ?? "rounded bg-slate-100 px-1.5 py-0.5 text-[0.9em] dark:bg-slate-800"} {...props}>{children}</code>,
                    table: ({ children, ...props }) => (
                        <div className="overflow-auto rounded-md border border-border">
                            <table className="w-full border-collapse text-sm" {...props}>{children}</table>
                        </div>
                    ),
                    th: ({ children, ...props }) => <th className="border-b border-border bg-muted px-3 py-2 text-left" {...props}>{children}</th>,
                    td: ({ children, ...props }) => <td className="border-b border-border px-3 py-2 align-top" {...props}>{children}</td>,
                    p: ({ children, ...props }) => <p className="mb-3 last:mb-0" {...props}>{children}</p>,
                    ul: ({ children, ...props }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0" {...props}>{children}</ul>,
                    ol: ({ children, ...props }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0" {...props}>{children}</ol>,
                }}
            >
                {content}
            </ReactMarkdown>
            <ChatActionBar
                reaction={reactions[`${messageId}:message`]}
                onCopy={() => onCopy(content)}
                onThumbsUp={() => onReact(`${messageId}:message`, "up")}
                onThumbsDown={() => onReact(`${messageId}:message`, "down")}
            />
        </div>
    );
};

const ChatPanel = ({
    open,
    onToggle,
    messages,
    pendingMessageId,
    draft,
    onDraftChange,
    onDraftKeyDown,
    onExecute,
    isPending,
    provider,
    reactions,
    onCopy,
    onReact,
}: {
    open: boolean;
    onToggle: () => void;
    messages: ChatMessage[];
    pendingMessageId: string | null;
    draft: string;
    onDraftChange: (value: string) => void;
    onDraftKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
    onExecute: () => void;
    isPending: boolean;
    provider: LlmProvider;
    reactions: Record<string, ChatReaction | undefined>;
    onCopy: (value: string) => void;
    onReact: (targetId: string, reaction: ChatReaction) => void;
}): JSX.Element => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const element = scrollRef.current;
        if (!element) {
            return;
        }
        element.scrollTop = element.scrollHeight;
    }, [messages, isPending]);

    useEffect(() => {
        const element = textareaRef.current;
        if (!element) {
            return;
        }
        element.style.height = "auto";
        element.style.height = `${Math.min(element.scrollHeight, 240)}px`;
        element.style.overflowY = element.scrollHeight > 240 ? "auto" : "hidden";
    }, [draft, open]);

    return (
        <div className={`relative z-20 shrink-0 overflow-hidden bg-card transition-[width,opacity,transform,border-color] duration-300 ${open ? "w-[min(32rem,44vw)] translate-x-0 border-l border-border opacity-100 shadow-[0_18px_48px_rgba(15,23,42,0.18)]" : "w-0 translate-x-6 border-l border-transparent opacity-0"}`}>
            <div className={`flex h-full w-[min(32rem,44vw)] flex-col overflow-hidden ${open ? "" : "pointer-events-none"}`}>
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Workspace Chat</p>
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{provider}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onToggle} aria-label="Hide chatbot">
                        <X className="h-4 w-4" />
                    </Button>
                </div>
                <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-auto bg-background/70 px-4 py-4">
                    {messages.length === 0 ? (
                        <div className="rounded-md border border-dashed border-border bg-card px-4 py-6 text-sm text-mutedForeground">
                            Ask the system a question. Responses are single-turn for now.
                        </div>
                    ) : null}
                    {messages.map((message) =>
                        message.role === "user" ? (
                            <div key={message.id} className="flex justify-end">
                                <div className="flex max-w-[80%] items-start gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white dark:bg-slate-100 dark:text-slate-900">
                                    {pendingMessageId === message.id ? <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin" /> : <UserRound className="mt-0.5 h-4 w-4 shrink-0" />}
                                    <p className="whitespace-pre-wrap leading-6">{message.content}</p>
                                </div>
                            </div>
                        ) : (
                            <div key={message.id} className="w-full rounded-xl border border-border bg-card p-4">
                                <AssistantMarkdown messageId={message.id} content={message.content} reactions={reactions} onCopy={onCopy} onReact={onReact} />
                            </div>
                        ),
                    )}
                    {isPending ? (
                        <div className="w-full rounded-xl border border-border bg-card p-4 text-sm text-mutedForeground">Thinking...</div>
                    ) : null}
                </div>
                <div className="shrink-0 border-t border-border bg-card px-4 pb-6 pt-4">
                    <div className="space-y-3">
                        <div className="relative">
                            <Textarea
                                ref={textareaRef}
                                value={draft}
                                onChange={(event) => onDraftChange(event.target.value)}
                                onKeyDown={onDraftKeyDown}
                                placeholder="How can I help?"
                                className="min-h-28 max-h-[240px] resize-none overflow-y-auto pb-4 pr-16 pt-4 leading-6"
                            />
                            <Button
                                variant="aero"
                                size="icon"
                                className="absolute right-3 top-3 h-10 w-10 rounded-full"
                                onClick={onExecute}
                                disabled={isPending || draft.trim().length === 0}
                                aria-label="Execute prompt"
                            >
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const nodeTypes = {
    pipeline: PipelineNode,
};

const ProjectRequiredNotice = (): JSX.Element => (
    <Alert variant="destructive">Create or load a project in step 1 before editing this step.</Alert>
);

const ProjectDefinitionDialog = ({ open, onOpenChange, mode, initialProject, onSubmit }: ProjectDefinitionDialogProps): JSX.Element => {
    const [form, setForm] = useState<ProjectFormState>(() => projectToFormState(initialProject));
    const [isSaving, setIsSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        setForm(mode === "create" ? createEmptyProjectForm() : projectToFormState(initialProject));
        setErrorMessage(null);
    }, [mode, initialProject, open]);

    const handleSubmit = async (): Promise<void> => {
        try {
            setIsSaving(true);
            setErrorMessage(null);
            const payload = buildProjectPayload(form, "config" in (initialProject ?? {}) ? ((initialProject as ProjectDetail).config ?? {}) : {});
            await onSubmit(payload);
            onOpenChange(false);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="h-[86vh] w-[80vw] max-w-none overflow-hidden rounded-lg border border-border bg-card p-0">
                <div className="flex h-full flex-col p-4">
                    <DialogHeader>
                        <DialogTitle>{mode === "create" ? "Create Project" : "Edit Project"}</DialogTitle>
                        <DialogDescription>Define the project record saved through the backend project CRUD endpoint.</DialogDescription>
                    </DialogHeader>
                    <div className="mt-4 min-h-0 flex-1 overflow-auto pr-2">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="grid items-center gap-3 grid-cols-[9rem_minmax(0,1fr)]">
                                <Label className="text-right">Display Name</Label>
                                <Input value={form.display_name} onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))} placeholder="Sweeney Migration" />
                            </div>
                            <div className="grid items-center gap-3 grid-cols-[9rem_minmax(0,1fr)]">
                                <Label className="text-right">Project Slug</Label>
                                <Input value={form.project_slug} onChange={(event) => setForm((current) => ({ ...current, project_slug: event.target.value }))} placeholder="sweeney-migration" />
                            </div>
                            <div className="grid items-center gap-3 grid-cols-[9rem_minmax(0,1fr)]">
                                <Label className="text-right">Firm Name</Label>
                                <Input value={form.firm_name} onChange={(event) => setForm((current) => ({ ...current, firm_name: event.target.value }))} />
                            </div>
                            <div className="grid items-center gap-3 grid-cols-[9rem_minmax(0,1fr)]">
                                <Label className="text-right">Firm Revenue</Label>
                                <Input value={form.firm_revenue} onChange={(event) => setForm((current) => ({ ...current, firm_revenue: event.target.value }))} placeholder="12500000.00" />
                            </div>
                            <div className="grid items-center gap-3 grid-cols-[9rem_minmax(0,1fr)]">
                                <Label className="text-right">Firm Staff Count</Label>
                                <Input value={form.firm_staff_count} onChange={(event) => setForm((current) => ({ ...current, firm_staff_count: event.target.value }))} />
                            </div>
                            <div className="grid items-center gap-3 grid-cols-[9rem_minmax(0,1fr)]">
                                <Label className="text-right">Firm Office Count</Label>
                                <Input value={form.firm_office_count} onChange={(event) => setForm((current) => ({ ...current, firm_office_count: event.target.value }))} />
                            </div>
                            <div className="grid items-center gap-3 grid-cols-[9rem_minmax(0,1fr)]">
                                <Label className="text-right">Source System</Label>
                                <Input value={form.source_system} onChange={(event) => setForm((current) => ({ ...current, source_system: event.target.value }))} />
                            </div>
                            <div className="grid items-center gap-3 grid-cols-[9rem_minmax(0,1fr)]">
                                <Label className="text-right">Source DB Platform</Label>
                                <Input value={form.source_db_platform} onChange={(event) => setForm((current) => ({ ...current, source_db_platform: event.target.value }))} />
                            </div>
                            <div className="grid items-center gap-3 grid-cols-[9rem_minmax(0,1fr)]">
                                <Label className="text-right">Databricks Handle</Label>
                                <Input value={form.databricks_handle} onChange={(event) => setForm((current) => ({ ...current, databricks_handle: event.target.value }))} />
                            </div>
                            <div className="grid items-center gap-3 grid-cols-[9rem_minmax(0,1fr)]">
                                <Label className="text-right">Destination System</Label>
                                <Input value={form.destination_system} onChange={(event) => setForm((current) => ({ ...current, destination_system: event.target.value }))} />
                            </div>
                            <div className="grid items-center gap-3 grid-cols-[9rem_minmax(0,1fr)]">
                                <Label className="text-right">DAU Instance ID</Label>
                                <Input value={form.dau_instance_id} onChange={(event) => setForm((current) => ({ ...current, dau_instance_id: event.target.value }))} />
                            </div>
                            <div className="grid items-center gap-3 grid-cols-[9rem_minmax(0,1fr)]">
                                <Label className="text-right">Status</Label>
                                <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value }))}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="draft">draft</SelectItem>
                                        <SelectItem value="active">active</SelectItem>
                                        <SelectItem value="archived">archived</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid items-center gap-3 grid-cols-[9rem_minmax(0,1fr)]">
                                <Label className="text-right">Current Step</Label>
                                <Input value={form.current_step} onChange={(event) => setForm((current) => ({ ...current, current_step: event.target.value }))} />
                            </div>
                            <div className="grid items-center gap-3 grid-cols-[9rem_minmax(0,1fr)]">
                                <Label className="text-right">Workflow Template</Label>
                                <Input value={form.wf_template_code} onChange={(event) => setForm((current) => ({ ...current, wf_template_code: event.target.value }))} />
                            </div>
                            <div className="grid items-center gap-3 grid-cols-[9rem_minmax(0,1fr)]">
                                <Label className="text-right">Cycle</Label>
                                <Input value={form.cycle} onChange={(event) => setForm((current) => ({ ...current, cycle: event.target.value }))} />
                            </div>
                            <div className="grid items-center gap-3 grid-cols-[9rem_minmax(0,1fr)] md:col-span-2">
                                <Label className="text-right">CT Lead</Label>
                                <Input value={form.ct_lead} onChange={(event) => setForm((current) => ({ ...current, ct_lead: event.target.value }))} />
                            </div>
                            <div className="grid items-start gap-3 grid-cols-[9rem_minmax(0,1fr)] md:col-span-2">
                                <Label className="pt-3 text-right">Source Connection</Label>
                                <Textarea value={form.source_connection} onChange={(event) => setForm((current) => ({ ...current, source_connection: event.target.value }))} className="min-h-32 font-mono text-sm" />
                            </div>
                            <div className="grid items-start gap-3 grid-cols-[9rem_minmax(0,1fr)] md:col-span-2">
                                <Label className="pt-3 text-right">Entities In Scope</Label>
                                <Textarea value={form.entities_in_scope} onChange={(event) => setForm((current) => ({ ...current, entities_in_scope: event.target.value }))} className="min-h-28 font-mono text-sm" />
                            </div>
                            <div className="grid items-start gap-3 grid-cols-[9rem_minmax(0,1fr)]">
                                <Label className="pt-3 text-right">Ascend Contacts</Label>
                                <Textarea value={form.ascend_contacts} onChange={(event) => setForm((current) => ({ ...current, ascend_contacts: event.target.value }))} className="min-h-28 font-mono text-sm" />
                            </div>
                            <div className="grid items-start gap-3 grid-cols-[9rem_minmax(0,1fr)]">
                                <Label className="pt-3 text-right">Known Risks</Label>
                                <Textarea value={form.known_risks} onChange={(event) => setForm((current) => ({ ...current, known_risks: event.target.value }))} className="min-h-28 font-mono text-sm" />
                            </div>
                            <div className="grid items-start gap-3 grid-cols-[9rem_minmax(0,1fr)] md:col-span-2">
                                <Label className="pt-3 text-right">Notes</Label>
                                <Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="min-h-32" />
                            </div>
                        </div>
                    </div>
                    {errorMessage ? <div className="mt-4"><Alert variant="destructive">{errorMessage}</Alert></div> : null}
                    <div className="mt-4 flex justify-end gap-2 border-t border-border pt-3">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button onClick={() => void handleSubmit()} disabled={isSaving}>{isSaving ? "Saving..." : mode === "create" ? "Create Project" : "Save Project"}</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

const ProjectModal = ({ open, onOpenChange, projects, currentProject, onSelectProject, onCreateProject, onUpdateProject, onDeleteProject }: ProjectModalProps): JSX.Element => {
    const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null);
    const [editingProject, setEditingProject] = useState<ProjectListItem | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);

    const handleDelete = async (projectId: string): Promise<void> => {
        try {
            setDeletingProjectId(projectId);
            setErrorMessage(null);
            await onDeleteProject(projectId);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error));
        } finally {
            setDeletingProjectId(null);
        }
    };

    const hasSelectedProject = currentProject !== null;

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent hideClose className="h-[82vh] w-[76vw] max-w-none overflow-hidden rounded-lg border border-border bg-card p-0">
                    <div className="flex h-full flex-col p-4">
                        <div className="flex items-start justify-between gap-4">
                            <DialogHeader>
                                <DialogTitle>Project</DialogTitle>
                                <DialogDescription>Pick the active project or create a new one through the backend project CRUD API.</DialogDescription>
                            </DialogHeader>
                            <div className="flex items-center gap-2">
                                <Button onClick={() => { setEditingProject(null); setEditorMode("create"); }}>
                                    <Plus className="h-4 w-4" />
                                    Project
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Close">
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                        {errorMessage ? <div className="mt-4"><Alert variant="destructive">{errorMessage}</Alert></div> : null}
                        <div className="mt-4 min-h-0 flex-1 overflow-auto pr-2">
                            {projects.length === 0 ? (
                                <div className="flex h-full min-h-48 items-center justify-center rounded-md border border-dashed border-border bg-background text-sm text-mutedForeground">
                                    No projects yet. Use + Project to create one.
                                </div>
                            ) : (
                                <div className="overflow-hidden rounded-md border border-border bg-background">
                                    <div className="min-w-[73rem]">
                                        <div className="grid grid-cols-[2.5rem_minmax(18rem,2fr)_minmax(14rem,1.6fr)_minmax(11rem,1.2fr)_8rem_5rem_6rem_9rem_7rem] gap-3 border-b border-border bg-muted/70 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                                            <p className="sr-only">Select</p>
                                            <p>Project</p>
                                            <p>Firm</p>
                                            <p>Source</p>
                                            <p>Status</p>
                                            <p>Cycle</p>
                                            <p>Staff</p>
                                            <p>Revenue</p>
                                            <p className="text-right">Actions</p>
                                        </div>
                                        <div>
                                            {projects.map((project) => {
                                                const isActive = currentProject?.id === project.id;
                                                return (
                                                    <div
                                                        key={project.id}
                                                        role="button"
                                                        tabIndex={0}
                                                        className={`grid grid-cols-[2.5rem_minmax(18rem,2fr)_minmax(14rem,1.6fr)_minmax(11rem,1.2fr)_8rem_5rem_6rem_9rem_7rem] items-center gap-3 border-b border-border px-4 py-3 text-left transition last:border-b-0 ${isActive ? "bg-slate-100 dark:bg-slate-900/70" : "hover:bg-slate-50 dark:hover:bg-slate-950/70"}`}
                                                        onClick={() => onSelectProject(project.id)}
                                                        onDoubleClick={() => { onSelectProject(project.id); onOpenChange(false); }}
                                                        onKeyDown={(event) => {
                                                            if (event.key === "Enter" || event.key === " ") {
                                                                event.preventDefault();
                                                                onSelectProject(project.id);
                                                            }
                                                        }}
                                                    >
                                                        <div className="flex justify-center">
                                                            <input
                                                                type="checkbox"
                                                                checked={isActive}
                                                                readOnly
                                                                aria-label={`Select ${project.display_name}`}
                                                                className="h-4 w-4 rounded border-border text-slate-900 accent-slate-900"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    onSelectProject(project.id);
                                                                }}
                                                            />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{project.display_name}</p>
                                                            <p className="truncate text-xs text-mutedForeground">{project.project_slug}</p>
                                                        </div>
                                                        <p className="truncate text-sm text-slate-700 dark:text-slate-200">{project.firm_name}</p>
                                                        <p className="truncate text-sm text-slate-700 dark:text-slate-200">{project.source_system}</p>
                                                        <p className="text-sm text-slate-700 dark:text-slate-200">{project.status}</p>
                                                        <p className="text-sm text-slate-700 dark:text-slate-200">{project.cycle ?? 1}</p>
                                                        <p className="text-sm text-slate-700 dark:text-slate-200">{project.firm_staff_count ?? "-"}</p>
                                                        <p className="text-sm text-slate-700 dark:text-slate-200">{formatProjectRevenue(project)}</p>
                                                        <div className="flex items-center justify-end gap-1">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    setEditingProject(project);
                                                                    setEditorMode("edit");
                                                                }}
                                                                aria-label="Edit project"
                                                            >
                                                                <Pencil className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    void handleDelete(project.id);
                                                                }}
                                                                aria-label="Delete project"
                                                                disabled={deletingProjectId === project.id}
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="mt-4 flex justify-end border-t border-border pt-3">
                            {hasSelectedProject ? (
                                <Button onClick={() => onOpenChange(false)}>
                                    <FolderOpen className="h-4 w-4" />
                                    Open Project
                                </Button>
                            ) : (
                                <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <ProjectDefinitionDialog
                open={editorMode === "create"}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen) {
                        setEditorMode(null);
                    }
                }}
                mode="create"
                initialProject={null}
                onSubmit={(payload) => onCreateProject(payload as ProjectMutationPayload)}
            />
            <ProjectDefinitionDialog
                open={editorMode === "edit"}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen) {
                        setEditorMode(null);
                        setEditingProject(null);
                    }
                }}
                mode="edit"
                initialProject={editingProject}
                onSubmit={(payload) => editingProject ? onUpdateProject(editingProject.id, payload) : Promise.resolve()}
            />
        </>
    );
};

const SchemaModal = ({ open, onOpenChange, project, projectConfig, onSaveConfig }: ModalProps): JSX.Element => {
    const initialCchSchema = projectConfig.dbSchema?.cchSchema ? toSchemaFileState(projectConfig.dbSchema.cchSchema.fileName, projectConfig.dbSchema.cchSchema.content) : null;
    const initialClientSchema = projectConfig.dbSchema?.clientSchema ? toSchemaFileState(projectConfig.dbSchema.clientSchema.fileName, projectConfig.dbSchema.clientSchema.content) : null;
    const [cchSchema, setCchSchema] = useState<SchemaFileState | null>(initialCchSchema);
    const [clientSchema, setClientSchema] = useState<SchemaFileState | null>(initialClientSchema);
    const [activeTab, setActiveTab] = useState<SchemaTabKey>("cchSchema");
    const [isEditing, setIsEditing] = useState(false);
    const [editorValue, setEditorValue] = useState("");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [openPicker, setOpenPicker] = useState<"cch" | "client" | null>(null);
    const [cchFiles, setCchFiles] = useState<string[]>([]);
    const [clientFiles, setClientFiles] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const cchPickerRef = useRef<HTMLDivElement>(null);
    const clientPickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setCchSchema(initialCchSchema);
        setClientSchema(initialClientSchema);
    }, [project?.id, initialCchSchema?.fileName, initialClientSchema?.fileName]);

    const activeSchema = activeTab === "cchSchema" ? cchSchema : clientSchema;

    useEffect(() => {
        setEditorValue(activeSchema?.text ?? "");
        setErrorMessage(null);
    }, [activeSchema, activeTab]);

    useEffect(() => {
        if (!open || !project) {
            return;
        }

        let isActive = true;
        const preloadStaticSchemas = async (): Promise<void> => {
            try {
                const [nextCchFiles, nextClientFiles] = await Promise.all([
                    staticSchemasApi.listFiles("cch"),
                    staticSchemasApi.listFiles("client"),
                ]);
                if (!isActive) {
                    return;
                }
                setCchFiles(nextCchFiles);
                setClientFiles(nextClientFiles);
                if (!cchSchema && nextCchFiles[0]) {
                    const parsed = await staticSchemasApi.getFile("cch", nextCchFiles[0]);
                    if (isActive) {
                        setCchSchema(toSchemaFileState(nextCchFiles[0], parsed));
                    }
                }
                if (!clientSchema && nextClientFiles[0]) {
                    const parsed = await staticSchemasApi.getFile("client", nextClientFiles[0]);
                    if (isActive) {
                        setClientSchema(toSchemaFileState(nextClientFiles[0], parsed));
                    }
                }
            } catch (error) {
                if (isActive) {
                    setErrorMessage(getApiErrorMessage(error));
                }
            }
        };
        void preloadStaticSchemas();
        return () => {
            isActive = false;
        };
    }, [open, project?.id, cchSchema, clientSchema]);

    useEffect(() => {
        if (!openPicker) {
            return;
        }
        const handleOutsideClick = (event: MouseEvent): void => {
            const ref = openPicker === "cch" ? cchPickerRef : clientPickerRef;
            if (ref.current && !ref.current.contains(event.target as unknown as globalThis.Node)) {
                setOpenPicker(null);
            }
        };
        document.addEventListener("mousedown", handleOutsideClick);
        return () => document.removeEventListener("mousedown", handleOutsideClick);
    }, [openPicker]);

    const handleTogglePicker = async (folder: "cch" | "client"): Promise<void> => {
        if (openPicker === folder) {
            setOpenPicker(null);
            return;
        }
        try {
            const files = await staticSchemasApi.listFiles(folder);
            if (folder === "cch") {
                setCchFiles(files);
            } else {
                setClientFiles(files);
            }
            setOpenPicker(folder);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error));
        }
    };

    const handleStaticFileLoad = async (folder: "cch" | "client", filename: string): Promise<void> => {
        try {
            const parsedJson = await staticSchemasApi.getFile(folder, filename);
            const nextSchema = toSchemaFileState(filename, parsedJson);
            if (folder === "cch") {
                setCchSchema(nextSchema);
                setActiveTab("cchSchema");
            } else {
                setClientSchema(nextSchema);
                setActiveTab("clientSchema");
            }
            setOpenPicker(null);
            setIsEditing(false);
            setErrorMessage(null);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error));
        }
    };

    const handleSave = async (): Promise<void> => {
        if (!project || !cchSchema || !clientSchema) {
            setErrorMessage("Both schema files must be loaded before saving.");
            return;
        }
        try {
            setIsSaving(true);
            const nextConfig: ProjectConfig = {
                ...projectConfig,
                dbSchema: {
                    cchSchema: { fileName: cchSchema.fileName, content: cchSchema.value },
                    clientSchema: { fileName: clientSchema.fileName, content: clientSchema.value },
                },
            };
            await onSaveConfig(nextConfig);
            setIsEditing(false);
            onOpenChange(false);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error));
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveEditor = (): void => {
        try {
            const parsedJson = JSON.parse(editorValue) as unknown;
            const nextSchema = toSchemaFileState(activeSchema?.fileName ?? "schema.json", parsedJson);
            if (activeTab === "cchSchema") {
                setCchSchema(nextSchema);
            } else {
                setClientSchema(nextSchema);
            }
            setEditorValue(nextSchema.text);
            setIsEditing(false);
            setErrorMessage(null);
        } catch {
            setErrorMessage("JSON must be valid before saving.");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="h-[90vh] w-[80vw] max-w-none rounded-lg border border-border bg-card p-0">
                <div className="flex h-full flex-col p-3">
                    <DialogHeader>
                        <DialogTitle>DB Schema</DialogTitle>
                        <DialogDescription>Configure, enrich, review, and edit the CCH and Client schema files.</DialogDescription>
                    </DialogHeader>
                    {!project ? <div className="mt-4"><ProjectRequiredNotice /></div> : null}
                    {project ? (
                        <>
                            <div className="mt-3 grid w-[calc(100%-3rem)] max-w-[90%] gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                                <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-200">CCH Schema</p>
                                        <p className="truncate text-sm text-slate-600 dark:text-slate-400">{cchSchema?.fileName ?? "No file selected"}</p>
                                    </div>
                                    <div className="relative shrink-0" ref={cchPickerRef}>
                                        <Button variant="outline" size="sm" type="button" onClick={() => void handleTogglePicker("cch")}>
                                            <FolderOpen className="h-4 w-4" />
                                            Open
                                            <ChevronDown className="h-3 w-3" />
                                        </Button>
                                        {openPicker === "cch" ? (
                                            <div className="absolute left-0 top-full z-50 mt-1 min-w-full max-w-[min(24rem,calc(80vw-4rem))] overflow-hidden rounded-md border border-slate-200 bg-white shadow-elevated dark:border-slate-700 dark:bg-slate-800">
                                                {cchFiles.map((name) => (
                                                    <button
                                                        key={name}
                                                        type="button"
                                                        className="w-full truncate px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                                                        onClick={() => void handleStaticFileLoad("cch", name)}
                                                    >
                                                        {name}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                                <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-200">Client Schema</p>
                                        <p className="truncate text-sm text-slate-600 dark:text-slate-400">{clientSchema?.fileName ?? "No file selected"}</p>
                                    </div>
                                    <div className="relative shrink-0" ref={clientPickerRef}>
                                        <Button variant="outline" size="sm" type="button" onClick={() => void handleTogglePicker("client")}>
                                            <FolderOpen className="h-4 w-4" />
                                            Open
                                            <ChevronDown className="h-3 w-3" />
                                        </Button>
                                        {openPicker === "client" ? (
                                            <div className="absolute left-0 top-full z-50 mt-1 min-w-full max-w-[min(24rem,calc(80vw-4rem))] overflow-hidden rounded-md border border-slate-200 bg-white shadow-elevated dark:border-slate-700 dark:bg-slate-800">
                                                {clientFiles.map((name) => (
                                                    <button
                                                        key={name}
                                                        type="button"
                                                        className="w-full truncate px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                                                        onClick={() => void handleStaticFileLoad("client", name)}
                                                    >
                                                        {name}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                            <div className={`mt-3 flex min-h-0 flex-1 flex-col ${isEditing ? "overflow-hidden bg-card" : "rounded-md border border-border bg-background"}`}>
                                <div className={`flex items-center gap-2 border-b border-border px-2.5 py-2 ${isEditing ? "bg-card" : "bg-background"}`}>
                                    <button
                                        type="button"
                                        className={`rounded-md px-2.5 py-1 text-sm font-medium transition ${activeTab === "cchSchema" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"}`}
                                        onClick={() => setActiveTab("cchSchema")}
                                    >
                                        CCH Schema
                                    </button>
                                    <button
                                        type="button"
                                        className={`rounded-md px-2.5 py-1 text-sm font-medium transition ${activeTab === "clientSchema" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"}`}
                                        onClick={() => setActiveTab("clientSchema")}
                                    >
                                        Client Schema
                                    </button>
                                    <div className="ml-auto flex items-center gap-2">
                                        <span className="text-xs text-slate-500 dark:text-slate-400">{activeSchema?.fileName ?? "No file loaded"}</span>
                                        <Button variant="outline" size="sm" onClick={() => setIsEditing((current) => !current)} disabled={!activeSchema}>{isEditing ? "Preview" : "Edit"}</Button>
                                        {isEditing ? <Button size="sm" onClick={handleSaveEditor}>Apply Edit</Button> : null}
                                    </div>
                                </div>
                                <div className="min-h-0 flex-1 overflow-hidden bg-card">
                                    {errorMessage ? <div className="m-4"><Alert variant="destructive">{errorMessage}</Alert></div> : null}
                                    {activeSchema ? (
                                        <div className="h-full min-h-0 bg-card">
                                            <JsonEditor text={editorValue || activeSchema.text} readOnly={!isEditing} onTextChange={setEditorValue} onError={setErrorMessage} />
                                        </div>
                                    ) : (
                                        <div className="flex h-full min-h-48 items-center justify-center rounded-md border border-dashed border-border bg-card text-sm text-mutedForeground">Select a JSON file to preview it here.</div>
                                    )}
                                </div>
                            </div>
                            <div className="mt-3 flex justify-end gap-2">
                                <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                                <Button onClick={() => void handleSave()} disabled={isSaving}>{isSaving ? "Saving..." : "Save Schema Config"}</Button>
                            </div>
                        </>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    );
};

const DiscoveryModal = ({ open, onOpenChange, project, projectConfig, onSaveConfig }: ModalProps): JSX.Element => {
    const discoveryQuery = useQuery({ queryKey: queryKeys.discoveryQuestions, queryFn: utilitiesApi.discoveryQuestions });
    const [answers, setAnswers] = useState<Record<string, string>>(projectConfig.discovery?.answers ?? {});
    const [sectionIndex, setSectionIndex] = useState(0);
    const [isSaving, setIsSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        setAnswers(projectConfig.discovery?.answers ?? {});
        setSectionIndex(0);
        setErrorMessage(null);
    }, [project?.id, open, projectConfig.discovery]);

    const sections = discoveryQuery.data?.sections ?? [];
    const activeSection = sections[sectionIndex];

    const persistAnswers = async (): Promise<void> => {
        if (!project) {
            return;
        }
        try {
            setIsSaving(true);
            await onSaveConfig({
                ...projectConfig,
                discovery: { answers },
            });
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error));
        } finally {
            setIsSaving(false);
        }
    };

    const handleNext = async (): Promise<void> => {
        await persistAnswers();
        setSectionIndex((current) => Math.min(current + 1, sections.length - 1));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="h-[82vh] w-[70vw] max-w-none overflow-hidden rounded-lg border border-border bg-card p-0">
                <div className="flex h-full flex-col p-4">
                    <DialogHeader>
                        <DialogTitle>Client Discovery</DialogTitle>
                        <DialogDescription>Use the discovery document as a wizard and move section by section.</DialogDescription>
                    </DialogHeader>
                    {!project ? <div className="mt-4"><ProjectRequiredNotice /></div> : null}
                    {project ? (
                        <>
                            {discoveryQuery.error ? <div className="mt-4"><Alert variant="destructive">{getApiErrorMessage(discoveryQuery.error)}</Alert></div> : null}
                            {errorMessage ? <div className="mt-4"><Alert variant="destructive">{errorMessage}</Alert></div> : null}
                            {activeSection ? (
                                <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-background p-4">
                                    <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Section {sectionIndex + 1} of {sections.length}</p>
                                            <h3 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{activeSection.category_title}</h3>
                                        </div>
                                        <Badge variant="outline">{activeSection.questions.length} questions</Badge>
                                    </div>
                                    <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-auto pr-2">
                                        {activeSection.questions.map((question) => (
                                            <div key={question.key} className="rounded-md border border-border bg-card p-4">
                                                <Label className="text-sm font-medium text-slate-900 dark:text-slate-100">{question.prompt}</Label>
                                                <Textarea
                                                    className="mt-3"
                                                    value={answers[question.key] ?? ""}
                                                    onChange={(event) =>
                                                        setAnswers((current) => ({
                                                            ...current,
                                                            [question.key]: event.target.value,
                                                        }))
                                                    }
                                                    placeholder="Enter the client-specific answer"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
                                        <Button variant="outline" onClick={() => setSectionIndex((current) => Math.max(current - 1, 0))} disabled={sectionIndex === 0}>Back</Button>
                                        <div className="flex gap-2">
                                            <Button variant="outline" onClick={() => void persistAnswers()} disabled={isSaving}>{isSaving ? "Saving..." : "Save Answers"}</Button>
                                            <Button onClick={() => void handleNext()} disabled={sectionIndex === sections.length - 1 || isSaving}>Next Section</Button>
                                        </div>
                                    </div>
                                </div>
                            ) : discoveryQuery.isLoading ? (
                                <div className="mt-4"><Alert>Loading discovery questions...</Alert></div>
                            ) : null}
                        </>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    );
};

const HeuristicsModal = ({ open, onOpenChange, project, projectConfig, onSaveConfig }: ModalProps): JSX.Element => {
    const DEFAULT_FILE = "conversion_heuristics.json";
    const [selectedFile, setSelectedFile] = useState<string>(projectConfig.heuristics?.fileName ?? DEFAULT_FILE);
    const [isSaving, setIsSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        setSelectedFile(projectConfig.heuristics?.fileName ?? DEFAULT_FILE);
        setErrorMessage(null);
    }, [open, project?.id, projectConfig.heuristics?.fileName]);

    const filesQuery = useQuery({
        queryKey: ["heuristics-files"],
        queryFn: () => staticSchemasApi.listFiles("heuristics"),
        enabled: open,
    });

    const fileContentQuery = useQuery({
        queryKey: ["heuristics-file", selectedFile],
        queryFn: () => staticSchemasApi.getFile("heuristics", selectedFile),
        enabled: open && Boolean(selectedFile),
    });

    const displayContent = fileContentQuery.data != null
        ? JSON.stringify(fileContentQuery.data, null, 2)
        : "";

    const handleSave = async (): Promise<void> => {
        if (!project || !selectedFile || fileContentQuery.data == null) {
            return;
        }
        try {
            setIsSaving(true);
            setErrorMessage(null);
            await onSaveConfig({
                ...projectConfig,
                heuristics: {
                    fileName: selectedFile,
                    content: JSON.stringify(fileContentQuery.data, null, 2),
                },
            });
            onOpenChange(false);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="h-[78vh] w-[68vw] max-w-none overflow-hidden rounded-lg border border-border bg-card p-0">
                <div className="flex h-full flex-col p-4">
                    <DialogHeader>
                        <DialogTitle>Heuristics</DialogTitle>
                        <DialogDescription>Select a heuristics file to attach to this project. The full file content will be saved to the project.</DialogDescription>
                    </DialogHeader>
                    {!project ? <div className="mt-4"><ProjectRequiredNotice /></div> : null}
                    {project ? (
                        <>
                            <div className="mt-4">
                                <Select value={selectedFile} onValueChange={setSelectedFile}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a heuristics file" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(filesQuery.data ?? [DEFAULT_FILE]).map((f) => (
                                            <SelectItem key={f} value={f}>{f}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            {errorMessage ? <div className="mt-3"><Alert variant="destructive">{errorMessage}</Alert></div> : null}
                            <div className="mt-3 min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-background">
                                {fileContentQuery.isLoading ? (
                                    <div className="flex h-full items-center justify-center text-sm text-mutedForeground">Loading...</div>
                                ) : (
                                    <pre className="h-full overflow-auto whitespace-pre-wrap p-3 font-mono text-xs leading-5 text-slate-800 dark:text-slate-200">{displayContent || <span className="text-mutedForeground">No file selected</span>}</pre>
                                )}
                            </div>
                            <div className="mt-4 flex justify-end">
                                <Button onClick={() => void handleSave()} disabled={isSaving || fileContentQuery.data == null}>
                                    {isSaving ? "Saving..." : "Set Heuristics"}
                                </Button>
                            </div>
                        </>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    );
};

const DbSetupModal = ({ open, onOpenChange, project, projectConfig, onSaveConfig }: ModalProps): JSX.Element => {
    const [clientDb, setClientDb] = useState<DbCredentials>(projectConfig.dbSetup?.client ?? {});
    const [stagingDb, setStagingDb] = useState<DbCredentials>(projectConfig.dbSetup?.staging ?? {});
    const [isSaving, setIsSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        setClientDb(projectConfig.dbSetup?.client ?? {});
        setStagingDb(projectConfig.dbSetup?.staging ?? {});
        setErrorMessage(null);
    }, [project?.id, open, projectConfig.dbSetup]);

    const renderDbFields = (title: string, values: DbCredentials, setValues: React.Dispatch<React.SetStateAction<DbCredentials>>): JSX.Element => (
        <div className="space-y-3 rounded-md border border-border bg-background p-4">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
            {[
                ["host", "Host"],
                ["port", "Port"],
                ["database", "Database"],
                ["schema", "Schema"],
                ["user", "User"],
                ["password", "Password"],
            ].map(([fieldKey, label]) => (
                <div key={fieldKey} className="grid items-center gap-3 grid-cols-[7rem_minmax(0,1fr)]">
                    <Label className="text-right text-fuchsia-600 dark:text-fuchsia-400">{label}</Label>
                    <Input
                        type={fieldKey === "password" ? "password" : "text"}
                        value={values[fieldKey as keyof DbCredentials] ?? ""}
                        onChange={(event) =>
                            setValues((current) => ({
                                ...current,
                                [fieldKey]: event.target.value,
                            }))
                        }
                    />
                </div>
            ))}
        </div>
    );

    const handleSave = async (): Promise<void> => {
        if (!project) {
            return;
        }
        try {
            setIsSaving(true);
            setErrorMessage(null);
            await onSaveConfig({
                ...projectConfig,
                dbSetup: {
                    client: clientDb,
                    staging: stagingDb,
                },
            });
            onOpenChange(false);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="h-[82vh] w-[72vw] max-w-none overflow-hidden rounded-lg border border-border bg-card p-0">
                <div className="flex h-full flex-col p-4">
                    <DialogHeader>
                        <DialogTitle>Client DB Setup</DialogTitle>
                        <DialogDescription>Collect the Postgres credentials for the client system and the staging system.</DialogDescription>
                    </DialogHeader>
                    {!project ? <div className="mt-4"><ProjectRequiredNotice /></div> : null}
                    {project ? (
                        <>
                            {errorMessage ? <div className="mt-4"><Alert variant="destructive">{errorMessage}</Alert></div> : null}
                            <div className="mt-4 grid min-h-0 flex-1 gap-4 overflow-auto pr-2 md:grid-cols-2">
                                {renderDbFields("Client System", clientDb, setClientDb)}
                                {renderDbFields("Staging System", stagingDb, setStagingDb)}
                            </div>
                            <div className="mt-4 flex justify-end gap-2">
                                <Button onClick={() => void handleSave()} disabled={isSaving}>{isSaving ? "Saving..." : "Save DB Setup"}</Button>
                            </div>
                        </>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    );
};

const TargetsModal = ({ open, onOpenChange, project, projectConfig, onSaveConfig }: ModalProps): JSX.Element => {
    const [targets, setTargets] = useState<TargetsConfig>(projectConfig.targets ?? {});
    const [isSaving, setIsSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [dependencyMessage, setDependencyMessage] = useState<string | null>(null);

    useEffect(() => {
        setTargets(projectConfig.targets ?? {});
        setErrorMessage(null);
        setDependencyMessage(null);
    }, [project?.id, open, projectConfig.targets]);

    const selectedEntities = sortSelectedTargetEntities(targets.selectedEntities ?? []);

    const handleToggleEntity = (entity: string, checked: boolean): void => {
        setTargets((current) => {
            const currentSelected = sortSelectedTargetEntities(current.selectedEntities ?? []);

            if (checked) {
                const requiredEntities = Array.from(collectTargetDependencies(entity));
                const nextSelected = sortSelectedTargetEntities([...currentSelected, ...requiredEntities, entity]);
                const autoAdded = requiredEntities.filter((item) => !currentSelected.includes(item));
                setDependencyMessage(
                    autoAdded.length > 0
                        ? `${entity} requires ${autoAdded.join(", ")}. They were added automatically in load order.`
                        : null,
                );
                return {
                    ...current,
                    selectedEntities: nextSelected,
                };
            }

            const dependentEntities = Array.from(collectDependentTargets(entity, currentSelected));
            const entitiesToRemove = new Set([entity, ...dependentEntities]);
            const nextSelected = currentSelected.filter((item) => !entitiesToRemove.has(item));
            setDependencyMessage(
                dependentEntities.length > 0
                    ? `Removed ${dependentEntities.join(", ")} because they depend on ${entity}.`
                    : null,
            );
            return {
                ...current,
                selectedEntities: nextSelected,
            };
        });
    };

    const advisoryEntities = ["Contacts (CCIU)", "Client Billing General Info", "Address Invoice and Statements"];
    const arOrWipSelected = selectedEntities.includes("AR") || selectedEntities.includes("WIP");
    const missingRoutingScope = advisoryEntities.filter((entity) => !selectedEntities.includes(entity));

    const handleSave = async (): Promise<void> => {
        if (!project) {
            return;
        }
        try {
            setIsSaving(true);
            setErrorMessage(null);
            await onSaveConfig({
                ...projectConfig,
                targets,
            });
            onOpenChange(false);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="h-[82vh] w-[72vw] max-w-none overflow-hidden rounded-lg border border-border bg-card p-0">
                <div className="flex h-full flex-col p-4">
                    <DialogHeader>
                        <DialogTitle>Targets</DialogTitle>
                        <DialogDescription>Pick the CCH entities to load. The checkbox logic enforces parent-child load order and flags thin AR or WIP scope.</DialogDescription>
                    </DialogHeader>
                    {!project ? <ProjectRequiredNotice /> : null}
                    {project ? (
                        <div className="mt-4 flex min-h-0 flex-1 flex-col space-y-4 overflow-hidden">
                            {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}
                            {dependencyMessage ? <Alert>{dependencyMessage}</Alert> : null}
                            {arOrWipSelected && missingRoutingScope.length > 0 ? (
                                <Alert>
                                    {`AR/WIP depends on Client first. Consider also scoping ${missingRoutingScope.join(", ")} so statement routing and billing config are in place before loading money.`}
                                </Alert>
                            ) : null}
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">CCH Load Scope</p>
                                    <p className="mt-1 text-sm text-mutedForeground">Checked items are saved in strict load order.</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            const allEntities = targetEntityDefinitions.map((d) => d.entity);
                                            const allChecked = allEntities.every((e) => selectedEntities.includes(e));
                                            if (allChecked) {
                                                setTargets((current) => ({ ...current, selectedEntities: [] }));
                                                setDependencyMessage(null);
                                            } else {
                                                setTargets((current) => ({ ...current, selectedEntities: allEntities }));
                                                setDependencyMessage(null);
                                            }
                                        }}
                                    >
                                        {targetEntityDefinitions.every((d) => selectedEntities.includes(d.entity)) ? "Uncheck All" : "Check All"}
                                    </Button>
                                    <Badge variant={selectedEntities.length > 0 ? "success" : "warning"}>{selectedEntities.length} selected</Badge>
                                </div>
                            </div>
                            <div className="min-h-0 flex-1 overflow-auto pr-2">
                                <div className="space-y-3">
                                    {targetEntityDefinitions.map((definition) => {
                                        const isChecked = selectedEntities.includes(definition.entity);
                                        return (
                                            <label key={definition.entity} className="flex items-start gap-4 rounded-md border border-border bg-background p-4 text-sm text-slate-700 transition hover:border-slate-300 dark:text-slate-200 dark:hover:border-slate-700">
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={(event) => handleToggleEntity(definition.entity, event.target.checked)}
                                                    className="mt-1 h-4 w-4 shrink-0"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <Badge variant="outline">{definition.order}</Badge>
                                                        <p className="font-semibold text-slate-900 dark:text-slate-100">{definition.entity}</p>
                                                    </div>
                                                    <p className="mt-2 text-sm text-mutedForeground">{definition.reason}</p>
                                                    {definition.dependencies.length > 0 ? <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Depends on: {definition.dependencies.join(", ")}</p> : null}
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 border-t border-border pt-3">
                                <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                                <Button onClick={() => void handleSave()} disabled={isSaving}>{isSaving ? "Saving..." : "Save Targets"}</Button>
                            </div>
                        </div>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    );
};

const SQL_ENTITIES = ["Contacts", "Clients", "Jobs", "AR", "WIP"] as const;
type SqlEntity = typeof SQL_ENTITIES[number];

const SqlModal = ({ open, onOpenChange, project, projectConfig, onSaveConfig }: ModalProps): JSX.Element => {
    const [selectedTemplates, setSelectedTemplates] = useState<string[]>(projectConfig.sql?.selectedTemplates ?? []);
    const [expandedEntity, setExpandedEntity] = useState<SqlEntity | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const entityQueries = SQL_ENTITIES.map((entity) =>
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useQuery({
            queryKey: ["sql-template", entity],
            queryFn: () => utilitiesApi.sqlTemplate(entity),
            enabled: open && expandedEntity === entity,
            staleTime: Infinity,
        })
    );

    useEffect(() => {
        setSelectedTemplates(projectConfig.sql?.selectedTemplates ?? []);
        setErrorMessage(null);
    }, [project?.id, open]);

    const toggleTemplate = (templateName: string): void => {
        setSelectedTemplates((current) =>
            current.includes(templateName) ? current.filter((item) => item !== templateName) : [...current, templateName],
        );
    };

    const handleSave = async (): Promise<void> => {
        if (!project) {
            return;
        }
        try {
            setIsSaving(true);
            setErrorMessage(null);
            await onSaveConfig(
                {
                    ...projectConfig,
                    sql: { selectedTemplates },
                },
                { entities_in_scope: selectedTemplates },
            );
            onOpenChange(false);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="h-[84vh] w-[72vw] max-w-none overflow-hidden rounded-lg border border-border bg-card p-0">
                <div className="flex h-full flex-col p-4">
                    <DialogHeader>
                        <DialogTitle>SQL</DialogTitle>
                        <DialogDescription>Review the SQL files from the backend static templates folder and mark the ones to execute later.</DialogDescription>
                    </DialogHeader>
                    {!project ? <div className="mt-4"><ProjectRequiredNotice /></div> : null}
                    {project ? (
                        <>
                            {errorMessage ? <div className="mt-4"><Alert variant="destructive">{errorMessage}</Alert></div> : null}
                            <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-auto pr-2">
                                {SQL_ENTITIES.map((entity, index) => {
                                    const query = entityQueries[index];
                                    const isExpanded = expandedEntity === entity;
                                    return (
                                        <div key={entity} className="rounded-md border border-border bg-background p-4">
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedTemplates.includes(entity)}
                                                    onChange={() => toggleTemplate(entity)}
                                                    className="h-4 w-4"
                                                />
                                                <span className="flex-1 text-sm font-medium text-slate-900 dark:text-slate-100">{entity}</span>
                                                <button
                                                    type="button"
                                                    className="text-sm text-primary"
                                                    onClick={() => setExpandedEntity(isExpanded ? null : entity)}
                                                >
                                                    {isExpanded ? "Hide SQL" : "Show SQL"}
                                                </button>
                                            </div>
                                            {isExpanded ? (
                                                <div className="mt-3">
                                                    {query.isLoading ? <p className="text-sm text-mutedForeground">Loading...</p> : null}
                                                    {query.error ? <Alert variant="destructive">{getApiErrorMessage(query.error)}</Alert> : null}
                                                    {query.data ? (
                                                        <pre className="overflow-auto rounded-md border border-border bg-card p-3 text-xs leading-6 text-mutedForeground">{query.data.content}</pre>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-4 flex justify-end gap-2">
                                <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                                <Button onClick={() => void handleSave()} disabled={isSaving}>{isSaving ? "Saving..." : "Save SQL Selection"}</Button>
                            </div>
                        </>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    );
};

const GenTestLoopModal = ({ open, onOpenChange, project, projectConfig, onSaveConfig, onExecute }: ModalProps): JSX.Element => {
    const [values, setValues] = useState<GenTestLoopConfig>(projectConfig.genTestLoop ?? {});
    const [isSaving, setIsSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        setValues(projectConfig.genTestLoop ?? {});
        setErrorMessage(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project?.id, open]);

    const handleSave = async (): Promise<void> => {
        if (!project) {
            return;
        }
        try {
            setIsSaving(true);
            setErrorMessage(null);
            await onSaveConfig({
                ...projectConfig,
                genTestLoop: values,
            });
            onOpenChange(false);
            onExecute?.();
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Gen-Test-Loop</DialogTitle>
                    <DialogDescription>Capture the loop objective and scoring notes for the autonomous SQL generation and evaluation cycle.</DialogDescription>
                </DialogHeader>
                {!project ? <ProjectRequiredNotice /> : null}
                {project ? (
                    <div className="space-y-4">
                        {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}
                        <div className="space-y-2">
                            <Label>Loop Objective</Label>
                            <Textarea value={values.objective ?? ""} onChange={(event) => setValues((current) => ({ ...current, objective: event.target.value }))} placeholder="Generate SQL, run it against the client DB, score the results, and iterate until target checks pass." />
                        </div>
                        <div className="space-y-2">
                            <Label>Scoring Notes</Label>
                            <Textarea value={values.scoringNotes ?? ""} onChange={(event) => setValues((current) => ({ ...current, scoringNotes: event.target.value }))} placeholder="Explain how AR, WIP, client count, and revenue by period should be evaluated." />
                        </div>
                        <div className="space-y-2">
                            <Label>Loop Budget</Label>
                            <Input value={values.loopBudget ?? ""} onChange={(event) => setValues((current) => ({ ...current, loopBudget: event.target.value }))} placeholder="10 iterations" />
                        </div>
                        <div className="space-y-2">
                            <Label>Loop Count</Label>
                            <Input value={values.loopCount ?? ""} onChange={(event) => setValues((current) => ({ ...current, loopCount: event.target.value }))} placeholder="0" />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button onClick={() => void handleSave()} disabled={isSaving}>{isSaving ? "Executing..." : "Execute"}</Button>
                        </div>
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    );
};

export const ProjectFlowCanvas = (): JSX.Element => {
    const queryClient = useQueryClient();
    const reactFlowRef = useRef<ReactFlowInstance<FlowCanvasNode> | null>(null);
    const token = useAuthStore((state) => state.token);
    const setToken = useAuthStore((state) => state.setToken);
    const clearToken = useAuthStore((state) => state.clearToken);
    const cachedUser = queryClient.getQueryData<User>(queryKeys.me);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [pfxStatus, setPfxStatus] = useState<Record<string, unknown> | null>(null);
    const [pfxStatusLoading, setPfxStatusLoading] = useState(false);
    const [pfxRevertLoading, setPfxRevertLoading] = useState(false);
    const [pfxWriteTestLoading, setPfxWriteTestLoading] = useState(false);
    const [pfxMessage, setPfxMessage] = useState<string | null>(null);
    const [pfxError, setPfxError] = useState<string | null>(null);
    const [activeStep, setActiveStep] = useState<StepId | null>(null);
    const [loopRunning, setLoopRunning] = useState(false);
    const [chatOpen, setChatOpen] = useState(false);
    const [chatDraft, setChatDraft] = useState("");
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatReactions, setChatReactions] = useState<Record<string, ChatReaction | undefined>>({});
    const [pendingUserMessageId, setPendingUserMessageId] = useState<string | null>(null);
    const [promptHistory, setPromptHistory] = useState<string[]>(() => readStoredPromptHistory());
    const [promptHistoryCursor, setPromptHistoryCursor] = useState(-1);
    const [currentProjectId, setCurrentProjectId] = useState<string | null>(() => readStoredProjectId());
    const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
        if (typeof window === "undefined") {
            return "light";
        }
        return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
    });
    const [llmProvider, setLlmProvider] = useState<LlmProvider>(() => {
        if (typeof window === "undefined") {
            return "deepseek";
        }
        return window.localStorage.getItem(LLM_PROVIDER_STORAGE_KEY) === "openai" ? "openai" : "deepseek";
    });
    const [userName, setUserName] = useState(cachedUser?.name ?? "Demo User");
    const [userEmail, setUserEmail] = useState(cachedUser?.email ?? "demo@local.test");
    const [currentUser, setCurrentUser] = useState<User | null>(cachedUser ?? null);

    const projectsQuery = useQuery({ queryKey: queryKeys.projects, queryFn: projectsApi.list });
    const currentProjectQuery = useQuery({
        queryKey: currentProjectId ? queryKeys.project(currentProjectId) : ["project", "none"],
        queryFn: () => projectsApi.detail(currentProjectId as string),
        enabled: Boolean(currentProjectId),
    });

    const createProjectMutation = useMutation({
        mutationFn: (payload: ProjectMutationPayload) => projectsApi.create(payload),
        onSuccess: (project) => {
            queryClient.setQueryData(queryKeys.project(project.id), project);
        },
    });

    const updateProjectMutation = useMutation({
        mutationFn: ({ projectId, payload }: { projectId: string; payload: Partial<ProjectMutationPayload> }) => projectsApi.update(projectId, payload),
        onSuccess: (project) => {
            queryClient.setQueryData(queryKeys.project(project.id), project);
        },
    });

    const archiveProjectMutation = useMutation({
        mutationFn: (projectId: string) => projectsApi.archive(projectId),
    });

    const chatMutation = useMutation({
        mutationFn: (payload: { prompt: string; provider: LlmProvider; systemPrompt?: string }) => llmApi.prompt(payload.prompt, payload.provider, payload.systemPrompt),
        onSuccess: (result: LLMPromptResponse) => {
            setPendingUserMessageId(null);
            setChatMessages((current) => [
                ...current,
                {
                    id: `assistant-${Date.now()}`,
                    role: "assistant",
                    content: result.response,
                    model: result.model,
                },
            ]);
            setChatDraft("");
        },
        onError: (error: unknown) => {
            setPendingUserMessageId(null);
            setChatMessages((current) => [
                ...current,
                {
                    id: `assistant-error-${Date.now()}`,
                    role: "assistant",
                    content: `Error: ${getApiErrorMessage(error)}`,
                },
            ]);
        },
    });

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }
        if (currentProjectId) {
            window.localStorage.setItem(CURRENT_PROJECT_STORAGE_KEY, currentProjectId);
        } else {
            window.localStorage.removeItem(CURRENT_PROJECT_STORAGE_KEY);
        }
    }, [currentProjectId]);

    useEffect(() => {
        const firstProjectId = projectsQuery.data?.[0]?.id;
        if (!currentProjectId && firstProjectId) {
            setCurrentProjectId(firstProjectId);
        }
    }, [projectsQuery.data, currentProjectId]);

    useEffect(() => {
        if (!currentProjectQuery.error) {
            return;
        }
        if (getApiErrorMessage(currentProjectQuery.error) === "Project not found.") {
            setCurrentProjectId(null);
        }
    }, [currentProjectQuery.error]);

    useEffect(() => {
        const root = document.documentElement;
        root.dataset.theme = themeMode;
        root.classList.toggle("dark", themeMode === "dark");
        root.style.colorScheme = themeMode;
        window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    }, [themeMode]);

    useEffect(() => {
        window.localStorage.setItem(LLM_PROVIDER_STORAGE_KEY, llmProvider);
    }, [llmProvider]);

    useEffect(() => {
        window.localStorage.setItem(CHAT_PROMPT_HISTORY_STORAGE_KEY, JSON.stringify(promptHistory.slice(0, CHAT_PROMPT_HISTORY_LIMIT)));
    }, [promptHistory]);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const fitCanvas = (duration: number): void => {
            reactFlowRef.current?.fitView({
                padding: chatOpen ? 0.32 : 0.2,
                minZoom: 0.6,
                maxZoom: 1.05,
                duration,
            });
        };

        const frameId = window.requestAnimationFrame(() => {
            fitCanvas(0);
        });
        const timeoutId = window.setTimeout(() => {
            fitCanvas(260);
        }, 340);

        return () => {
            window.cancelAnimationFrame(frameId);
            window.clearTimeout(timeoutId);
        };
    }, [chatOpen]);

    const currentProject = currentProjectQuery.data ?? null;
    const projectConfig = normalizeProjectConfig(currentProject?.config as Record<string, unknown> | undefined);

    const saveProjectConfig = async (nextConfig: ProjectConfig, projectFields: Partial<ProjectMutationPayload> = {}): Promise<void> => {
        if (!currentProject) {
            return;
        }
        const updatedProject = await updateProjectMutation.mutateAsync({
            projectId: currentProject.id,
            payload: {
                config: nextConfig as Record<string, unknown>,
                enriched_schema_path_cch: buildSchemaStoragePath("cch", nextConfig.dbSchema?.cchSchema?.fileName),
                enriched_schema_path_client: buildSchemaStoragePath("client", nextConfig.dbSchema?.clientSchema?.fileName),
                ...projectFields,
            },
        });
        queryClient.setQueryData(queryKeys.project(updatedProject.id), updatedProject);
        await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
        await queryClient.refetchQueries({ queryKey: queryKeys.project(updatedProject.id), exact: true });
    };

    const handleCreateProject = async (payload: ProjectMutationPayload): Promise<void> => {
        const createdProject = await createProjectMutation.mutateAsync(payload);
        await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
        setCurrentProjectId(createdProject.id);
    };

    const handleUpdateProject = async (projectId: string, payload: Partial<ProjectMutationPayload>): Promise<void> => {
        const updatedProject = await updateProjectMutation.mutateAsync({ projectId, payload });
        await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
        if (currentProjectId === projectId) {
            queryClient.removeQueries({ queryKey: queryKeys.project(projectId), exact: true });
            queryClient.setQueryData(queryKeys.project(updatedProject.id), updatedProject);
            setCurrentProjectId(updatedProject.id);
        }
    };

    const handleDeleteProject = async (projectId: string): Promise<void> => {
        await archiveProjectMutation.mutateAsync(projectId);
        queryClient.removeQueries({ queryKey: queryKeys.project(projectId), exact: true });
        if (currentProjectId === projectId) {
            setCurrentProjectId(null);
        }
        await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    };

    const handleApplyUser = (): void => {
        const normalizedName = userName.trim() || "Demo User";
        const normalizedEmail = userEmail.trim() || `${normalizedName.toLowerCase().replace(/\s+/g, ".")}@demo.local`;
        const demoUser = buildDemoUser(normalizedName, normalizedEmail);
        setToken(`demo-token-${Date.now()}`);
        queryClient.setQueryData(queryKeys.me, demoUser);
        setCurrentUser(demoUser);
        setSettingsOpen(false);
    };

    const handleLogout = (): void => {
        clearToken();
        queryClient.removeQueries({ queryKey: queryKeys.me, exact: true });
        setCurrentUser(null);
        setSettingsOpen(false);
    };

    const handleExecuteChat = (): void => {
        const prompt = chatDraft.trim();
        if (!prompt) {
            return;
        }
        const messageId = `user-${Date.now()}`;
        setPromptHistory((current) => [prompt, ...current].slice(0, CHAT_PROMPT_HISTORY_LIMIT));
        setPromptHistoryCursor(-1);
        setPendingUserMessageId(messageId);
        setChatMessages((current) => [
            ...current,
            {
                id: messageId,
                role: "user",
                content: prompt,
            },
        ]);
        setChatDraft("");
        const systemPrompt = currentProject ? [
            "You are an AI assistant embedded in the Ascend Migrate data migration tool.",
            "The user is working on the following active project. Use this context when answering questions.",
            "",
            `Project: ${currentProject.display_name}`,
            `Slug: ${currentProject.project_slug}`,
            `Firm: ${currentProject.firm_name ?? "-"}`,
            `Source System: ${currentProject.source_system ?? "-"}`,
            `Destination System: ${currentProject.destination_system ?? "-"}`,
            `Status: ${currentProject.status ?? "-"}`,
            `Cycle: ${currentProject.cycle ?? 1}`,
            `Staff Count: ${currentProject.firm_staff_count ?? "-"}`,
            `Revenue: ${currentProject.firm_revenue != null ? currentProject.firm_revenue.toLocaleString() : "-"}`,
            `DAU Instance: ${currentProject.dau_instance_id ?? "-"}`,
            `Databricks Handle: ${currentProject.databricks_handle ?? "-"}`,
            `CT Lead: ${currentProject.ct_lead ?? "-"}`,
            `Loop Count: ${projectConfig.genTestLoop?.loopCount ?? "0"}`,
            `Loop Budget: ${projectConfig.genTestLoop?.loopBudget ?? "-"}`,
            `Loop Objective: ${projectConfig.genTestLoop?.objective ?? "-"}`,
            `Notes: ${currentProject.notes ?? "-"}`,
        ].join("\n") : undefined;
        chatMutation.mutate({ prompt, provider: llmProvider, systemPrompt });
    };

    const handleChatDraftKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (!chatMutation.isPending && chatDraft.trim().length > 0) {
                handleExecuteChat();
            }
            return;
        }

        if (!event.ctrlKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) {
            return;
        }
        if (promptHistory.length === 0) {
            return;
        }
        event.preventDefault();

        if (event.key === "ArrowUp") {
            const nextIndex = promptHistoryCursor === -1 ? 0 : (promptHistoryCursor + 1) % promptHistory.length;
            setPromptHistoryCursor(nextIndex);
            setChatDraft(promptHistory[nextIndex] ?? "");
            return;
        }

        const nextIndex = promptHistoryCursor === -1 ? promptHistory.length - 1 : (promptHistoryCursor - 1 + promptHistory.length) % promptHistory.length;
        setPromptHistoryCursor(nextIndex);
        setChatDraft(promptHistory[nextIndex] ?? "");
    };

    const handleChatDraftChange = (value: string): void => {
        setPromptHistoryCursor(-1);
        setChatDraft(value);
    };

    const handleCopyChatContent = (value: string): void => {
        if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
            return;
        }
        void navigator.clipboard.writeText(value);
    };

    const handleReactToChat = (targetId: string, reaction: ChatReaction): void => {
        setChatReactions((current) => ({
            ...current,
            [targetId]: current[targetId] === reaction ? undefined : reaction,
        }));
    };

    const handleOpenStep = (stepId: StepId): void => {
        setActiveStep(stepId);
    };

    const nodes = useMemo<FlowCanvasNode[]>(() => {
        const configuredMap: Record<StepId, boolean> = {
            "step-1": Boolean(currentProject),
            "step-2": isDbSchemaConfigured(projectConfig),
            "step-3": isDiscoveryConfigured(projectConfig),
            "step-4": isHeuristicsConfigured(projectConfig),
            "step-5": isDbSetupConfigured(projectConfig),
            "step-6": isTargetsConfigured(projectConfig),
            "step-7": isSqlConfigured(projectConfig),
            "step-8": isLoopConfigured(projectConfig),
        };

        const sqlConfiguredCount = projectConfig.sql?.selectedTemplates?.length ?? 0;

        return flowSteps.map<FlowCanvasNode>((step) => ({
            id: step.id,
            type: "pipeline",
            position: step.position,
            draggable: false,
            data: {
                id: step.id,
                step: step.step,
                title: step.title,
                summary: step.summary,
                output: step.output,
                accentClassName: step.accentClassName,
                configured: configuredMap[step.id],
                configuredLabel: step.id === "step-7" ? `${sqlConfiguredCount} Configured` : step.id === "step-6" ? `${(projectConfig.targets?.selectedEntities?.length ?? 0)} Scopes` : undefined,
                onOpen: handleOpenStep,
                loopRunning: (step.id === "step-8" || step.id === "step-7") ? loopRunning : undefined,
                onStopLoop: step.id === "step-8" ? () => { setLoopRunning(false); } : undefined,
                loopCount: step.id === "step-8" ? projectConfig.genTestLoop?.loopCount : undefined,
                selectedScopes: step.id === "step-6" ? sortSelectedTargetEntities(projectConfig.targets?.selectedEntities ?? []) : undefined,
            },
        }));
    }, [currentProject, projectConfig, loopRunning]);

    const animatedEdges = useMemo<Edge[]>(() => {
        if (!loopRunning) {
            return initialEdges;
        }
        return initialEdges.map((edge) => {
            if (edge.id === "e7-8" || edge.id === "e8-7-loop") {
                return { ...edge, animated: true, style: { stroke: "#3b82f6", strokeWidth: 2.5 } };
            }
            return edge;
        });
    }, [loopRunning]);

    const configuredCount = getConfiguredCount(currentProject);
    const selectedProjectSettings = currentProject ? [
        { label: "Project", value: currentProject.display_name },
        { label: "Slug", value: currentProject.project_slug },
        { label: "Firm", value: currentProject.firm_name },
        { label: "Source", value: currentProject.source_system },
        { label: "Status", value: currentProject.status },
        { label: "Cycle", value: String(currentProject.cycle ?? 1) },
        { label: "Staff", value: currentProject.firm_staff_count != null ? String(currentProject.firm_staff_count) : "-" },
        { label: "Revenue", value: formatProjectRevenue(currentProject) },
    ] : [];

    return (
        <div className="h-screen overflow-hidden bg-background p-4">
            <div className="mx-auto flex h-full w-full overflow-hidden rounded-lg border border-boorder bg-card shadow-panel">
                <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
                    <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-3">
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="info">Ascend Migrate</Badge>
                                <Badge variant={configuredCount >= 5 ? "success" : "warning"}>{configuredCount} steps configured</Badge>
                                <Badge variant="outline">{currentProject ? currentProject.name : "No project loaded"}</Badge>
                                <Badge variant="outline">LLM: {llmProvider === "deepseek" ? "DeepSeek" : "OpenAI"}</Badge>
                                <Badge variant="outline">Loop Count: {projectConfig.genTestLoop?.loopCount || "—"}</Badge>
                            </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-3">
                            <Link to="/login">
                                <Button>
                                    <Play className="h-4 w-4" />
                                    Demo Login
                                    <ArrowRight className="h-4 w-4" />
                                </Button>
                            </Link>
                            <Button variant="outline" size="icon" onClick={() => setChatOpen((current) => !current)} aria-label={chatOpen ? "Hide chatbot" : "Show chatbot"}>
                                <MessageSquareText className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => setSettingsOpen(true)} aria-label="Open settings">
                                <Settings2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                    {currentProject ? (
                        <div className="shrink-0 border-b border-border bg-muted/30 px-5 py-3 text-sm text-slate-700 dark:text-slate-200">
                            <div className="flex flex-wrap gap-x-6 gap-y-2">
                                {selectedProjectSettings.map((item) => (
                                    <div key={item.label}>
                                        <span className="font-semibold text-sky-600 dark:text-sky-400">{item.label}:</span> {item.value}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}
                    <div className="min-h-0 flex-1 bg-background">
                        {projectsQuery.error ? <div className="m-4"><Alert variant="destructive">{getApiErrorMessage(projectsQuery.error)}</Alert></div> : null}
                        {currentProjectQuery.error ? <div className="m-4"><Alert variant="destructive">{getApiErrorMessage(currentProjectQuery.error)}</Alert></div> : null}
                        <div className="flex h-full min-w-0">
                            <div className="min-w-0 flex-1">
                                <ReactFlow
                                    nodes={nodes}
                                    edges={animatedEdges}
                                    nodeTypes={nodeTypes}
                                    onNodeClick={(_, node) => {
                                        handleOpenStep(node.id as StepId);
                                    }}
                                    onInit={(instance) => {
                                        reactFlowRef.current = instance;
                                    }}
                                    fitView
                                    fitViewOptions={{ padding: chatOpen ? 0.32 : 0.2, minZoom: 0.7, maxZoom: 1.05 }}
                                    minZoom={0.6}
                                    maxZoom={1.2}
                                    panOnDrag={false}
                                    panOnScroll={false}
                                    zoomOnDoubleClick={false}
                                    zoomOnPinch={false}
                                    zoomOnScroll={false}
                                    nodesDraggable={false}
                                    nodesConnectable={false}
                                    elementsSelectable={false}
                                    selectionOnDrag={false}
                                    proOptions={{ hideAttribution: true }}
                                    className="h-full w-full cursor-default"
                                >
                                    <Background gap={20} size={1} color="#cbd5e1" />
                                    <Controls showInteractive={false} position="bottom-right" />
                                </ReactFlow>
                            </div>
                            <ChatPanel
                                open={chatOpen}
                                onToggle={() => setChatOpen(false)}
                                messages={chatMessages}
                                pendingMessageId={pendingUserMessageId}
                                draft={chatDraft}
                                onDraftChange={handleChatDraftChange}
                                onDraftKeyDown={handleChatDraftKeyDown}
                                onExecute={handleExecuteChat}
                                isPending={chatMutation.isPending}
                                provider={llmProvider}
                                reactions={chatReactions}
                                onCopy={handleCopyChatContent}
                                onReact={handleReactToChat}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <ProjectModal
                open={activeStep === "step-1"}
                onOpenChange={(open) => setActiveStep(open ? "step-1" : null)}
                projects={projectsQuery.data ?? []}
                currentProject={currentProject}
                onSelectProject={setCurrentProjectId}
                onCreateProject={handleCreateProject}
                onUpdateProject={handleUpdateProject}
                onDeleteProject={handleDeleteProject}
            />
            <SchemaModal open={activeStep === "step-2"} onOpenChange={(open) => setActiveStep(open ? "step-2" : null)} project={currentProject} projectConfig={projectConfig} onSaveConfig={saveProjectConfig} />
            <DiscoveryModal open={activeStep === "step-3"} onOpenChange={(open) => setActiveStep(open ? "step-3" : null)} project={currentProject} projectConfig={projectConfig} onSaveConfig={saveProjectConfig} />
            <HeuristicsModal open={activeStep === "step-4"} onOpenChange={(open) => setActiveStep(open ? "step-4" : null)} project={currentProject} projectConfig={projectConfig} onSaveConfig={saveProjectConfig} />
            <DbSetupModal open={activeStep === "step-5"} onOpenChange={(open) => setActiveStep(open ? "step-5" : null)} project={currentProject} projectConfig={projectConfig} onSaveConfig={saveProjectConfig} />
            <TargetsModal open={activeStep === "step-6"} onOpenChange={(open) => setActiveStep(open ? "step-6" : null)} project={currentProject} projectConfig={projectConfig} onSaveConfig={saveProjectConfig} />
            <SqlModal open={activeStep === "step-7"} onOpenChange={(open) => setActiveStep(open ? "step-7" : null)} project={currentProject} projectConfig={projectConfig} onSaveConfig={saveProjectConfig} />
            <GenTestLoopModal open={activeStep === "step-8"} onOpenChange={(open) => setActiveStep(open ? "step-8" : null)} project={currentProject} projectConfig={projectConfig} onSaveConfig={saveProjectConfig} onExecute={() => { setLoopRunning(true); }} />

            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Workspace Settings</DialogTitle>
                        <DialogDescription>Set the current demo user, active LLM provider, and canvas theme.</DialogDescription>
                    </DialogHeader>
                    <div className="rounded-md border border-border bg-background p-3 space-y-2">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">PFx Server</p>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={pfxStatusLoading}
                                onClick={() => {
                                    setPfxStatus(null);
                                    setPfxMessage(null);
                                    setPfxError(null);
                                    setPfxStatusLoading(true);
                                    pfxApi.status()
                                        .then((data) => { setPfxStatus(data); })
                                        .catch((err: unknown) => { setPfxError(getApiErrorMessage(err)); })
                                        .finally(() => { setPfxStatusLoading(false); });
                                }}
                            >
                                {pfxStatusLoading ? "Checking..." : "PFx DB Status"}
                            </Button>
                            <Button
                                size="sm"
                                variant="destructive"
                                disabled={pfxRevertLoading}
                                onClick={() => {
                                    setPfxStatus(null);
                                    setPfxMessage(null);
                                    setPfxError(null);
                                    setPfxRevertLoading(true);
                                    pfxApi.revert()
                                        .then((data) => { setPfxMessage(data.message); })
                                        .catch((err: unknown) => { setPfxError(getApiErrorMessage(err)); })
                                        .finally(() => { setPfxRevertLoading(false); });
                                }}
                            >
                                {pfxRevertLoading ? "Reverting..." : "PFx DB Revert"}
                            </Button>
                            <Button
                                size="sm"
                                variant="secondary"
                                disabled={pfxWriteTestLoading}
                                onClick={() => {
                                    setPfxStatus(null);
                                    setPfxMessage(null);
                                    setPfxError(null);
                                    setPfxWriteTestLoading(true);
                                    pfxApi.writeTest()
                                        .then((data) => { setPfxMessage(`${data.message} Total rows: ${data.client_row_count}`); })
                                        .catch((err: unknown) => { setPfxError(getApiErrorMessage(err)); })
                                        .finally(() => { setPfxWriteTestLoading(false); });
                                }}
                            >
                                {pfxWriteTestLoading ? "Writing..." : "PFx Write Test"}
                            </Button>
                        </div>
                        {pfxError ? <Alert variant="destructive" className="text-xs py-2">{pfxError}</Alert> : null}
                        {pfxMessage ? <p className="text-xs text-green-600 dark:text-green-400">{pfxMessage}</p> : null}
                        {pfxStatus ? (
                            <pre className="mt-1 overflow-auto rounded-md border border-border bg-card p-2 text-xs leading-5 text-slate-700 dark:text-slate-300">{JSON.stringify(pfxStatus, null, 2)}</pre>
                        ) : null}
                    </div>
                    <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>User Name</Label>
                                <Input value={userName} onChange={(event) => setUserName(event.target.value)} placeholder="Demo User" />
                            </div>
                            <div className="space-y-2">
                                <Label>Email</Label>
                                <Input value={userEmail} onChange={(event) => setUserEmail(event.target.value)} placeholder="demo@local.test" />
                            </div>
                            <div className="rounded-md border border-border bg-background p-3 text-sm text-mutedForeground">
                                <p className="font-semibold text-slate-900 dark:text-slate-100">Current Session</p>
                                <p className="mt-1">{currentUser ? `${currentUser.name} · ${currentUser.email}` : "No user is currently set for this demo."}</p>
                                <p className="mt-2 text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Status: {token ? "logged in" : "logged out"}</p>
                            </div>
                        </div>
                        <div className="space-y-4 rounded-md border border-border bg-background p-3">
                            <div className="space-y-2">
                                <Label>LLM Provider</Label>
                                <Select value={llmProvider} onValueChange={(value) => setLlmProvider(value as LlmProvider)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a provider" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="deepseek">DeepSeek</SelectItem>
                                        <SelectItem value="openai">OpenAI</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-3">
                                <Label>Theme</Label>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <button
                                        type="button"
                                        className={`flex items-center justify-between rounded-md border px-3 py-2 text-left transition ${themeMode === "light" ? "border-slate-900 bg-white text-slate-900 dark:border-slate-100 dark:bg-slate-900 dark:text-slate-100" : "border-slate-200 bg-white/60 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}
                                        onClick={() => setThemeMode("light")}
                                    >
                                        <span className="font-medium">Light</span>
                                        <Sun className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        className={`flex items-center justify-between rounded-md border px-3 py-2 text-left transition ${themeMode === "dark" ? "border-slate-900 bg-slate-900 text-slate-100 dark:border-slate-100" : "border-slate-200 bg-white/60 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}
                                        onClick={() => setThemeMode("dark")}
                                    >
                                        <span className="font-medium">Dark</span>
                                        <Moon className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="flex flex-col gap-3 pt-2">
                                <Button onClick={handleApplyUser}>{token ? "Update User" : "Login User"}</Button>
                                <Button variant="outline" onClick={handleLogout}>Logout</Button>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};