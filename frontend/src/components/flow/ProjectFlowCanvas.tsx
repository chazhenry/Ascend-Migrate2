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
import { ArrowRight, ChevronDown, Copy, FolderOpen, MessageSquareText, Moon, Play, Settings2, Sun, ThumbsDown, ThumbsUp, UserRound, X } from "lucide-react";
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
import { getApiErrorMessage, llmApi, projectsApi, staticSchemasApi, utilitiesApi } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { useAuthStore } from "@/stores/authStore";
import type { DiscoveryQuestionDocument, LLMPromptResponse, ProjectDetail, ProjectListItem, SqlTemplate, User } from "@/types/api";

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
    onOpen: (stepId: StepId) => void;
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
    onSaveConfig: (config: ProjectConfig) => Promise<void>;
}

interface ProjectModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    projects: ProjectListItem[];
    currentProject: ProjectDetail | null;
    onSelectProject: (projectId: string) => void;
    onCreateProject: (name: string) => Promise<void>;
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
const isTargetsConfigured = (config: ProjectConfig): boolean => Boolean(config.targets?.arBalance && config.targets?.wipBalance && config.targets?.clientCount && config.targets?.revenueByPeriod);
const isSqlConfigured = (config: ProjectConfig): boolean => (config.sql?.selectedTemplates?.length ?? 0) > 0;
const isLoopConfigured = (config: ProjectConfig): boolean => Boolean(config.genTestLoop?.objective || config.genTestLoop?.scoringNotes || config.genTestLoop?.loopBudget);

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

    return (
        <>
            <Handle id="top" type="target" position={Position.Top} className="!h-3 !w-3 !border-2 !border-white !bg-slate-900" />
            <Handle id="left" type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-white !bg-slate-900" />
            <Handle id="bottom-target" type="target" position={Position.Bottom} className="!h-3 !w-3 !border-2 !border-white !bg-slate-900" />
            <div
                role="button"
                tabIndex={0}
                className="flex h-[264px] w-[312px] cursor-pointer flex-col rounded-lg border border-border bg-card p-3 shadow-panel transition hover:border-slate-400 hover:shadow-[0_12px_28px_rgba(15,23,42,0.12)] focus:outline-none focus:ring-2 focus:ring-slate-300 dark:hover:border-slate-500 dark:focus:ring-slate-600"
                onClick={() => nodeData.onOpen(nodeData.id as StepId)}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        nodeData.onOpen(nodeData.id as StepId);
                    }
                }}
            >
                <div className={`-mx-3 -mt-3 mb-3 h-1 rounded-t-lg ${nodeData.accentClassName}`} />
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500 dark:text-slate-400">{nodeData.step}</p>
                            <h3 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">{nodeData.title}</h3>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{nodeData.summary}</p>
                    </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                    <Badge variant="outline">Flow Step</Badge>
                    <Badge variant={nodeData.configured ? "success" : "warning"}>{nodeData.configured ? "Configured" : "Needs input"}</Badge>
                </div>
                <div className="mt-auto rounded-md border border-border bg-background p-2.5 text-xs text-mutedForeground">
                    <p className="font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Output</p>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-100">{nodeData.output}</p>
                </div>
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
    compact = false,
}: {
    reaction?: ChatReaction;
    onCopy: () => void;
    className,
    onThumbsDown: () => void;
    compact?: boolean;
}): JSX.Element => (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? "" : "pt-3"}`}>
        <Button variant="ghost" size="sm" className="h-8 rounded-full px-2.5 text-xs" onClick={onCopy}>
            className?: string;
            Copy
            <div className={`absolute bottom-0 right-3 z-10 flex -translate-y-1/2 items-center gap-1 rounded-full border border-border bg-card/95 p-1 shadow-panel backdrop-blur ${className ?? ""}`}>
                <Button
                    variant="ghost"
                    className={`h-8 rounded-full px-2.5 text-xs ${reaction === "up" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" : ""}`}
                    onClick={onThumbsUp}
                >
                    size="icon"
                    className={`h-7 w-7 rounded-full ${reaction === "up" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" : ""}`}
                </Button>
                aria-label="Thumbs up"
                <Button
                    variant="ghost"
                    className={`h-8 rounded-full px-2.5 text-xs ${reaction === "down" ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" : ""}`}
                    onClick={onThumbsDown}
                >
                    size="icon"
                    className={`h-7 w-7 rounded-full ${reaction === "down" ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" : ""}`}
                </Button>
                aria-label="Thumbs down"
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
            <div className="prose prose-sm max-w-none text-slate-700 dark:prose-invert dark:text-slate-100">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                        pre: ({ children, ...props }) => {
                            const codeIndex = codeBlockIndex;
                            codeBlockIndex += 1;
                            const codeText = getNodeText(children).replace(/\n$/, "");
                            const reactionKey = `${messageId}:code:${codeIndex}`;

                            return (
                                <div className="overflow-hidden rounded-md border border-border bg-slate-950 text-slate-100">
                                    <div className="border-b border-slate-800 px-3 py-2 text-[11px] uppercase tracking-[0.24em] text-slate-400">Code</div>
                                    <pre className="overflow-auto p-4 text-xs leading-6" {...props}>{children}</pre>
                                    <div className="border-t border-slate-800 px-3 py-2">
                                        <ChatActionBar
                                            compact
                                            reaction={reactions[reactionKey]}
                                            onCopy={() => onCopy(codeText)}
                                            onThumbsUp={() => onReact(reactionKey, "up")}
                                            onThumbsDown={() => onReact(reactionKey, "down")}
                                        />
                                    </div>
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
                    <div className="relative mb-6 rounded-md border border-border bg-slate-950 text-slate-100">

    useEffect(() => {
                                    <ChatActionBar
                                        className="border-slate-700 bg-slate-950/95 text-slate-100"
                                        reaction={reactions[reactionKey]}
                                        onCopy={() => onCopy(codeText)}
                                        onThumbsUp={() => onReact(reactionKey, "up")}
                                        onThumbsDown={() => onReact(reactionKey, "down")}
                                    />
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
                                    <UserRound className="mt-0.5 h-4 w-4 shrink-0" />
                                    <p className="whitespace-pre-wrap leading-6">{message.content}</p>
                                </div>
                            </div>
                        ) : (
                            <div key={message.id} className="w-full rounded-xl border border-border bg-card p-4">
                                <div className="mb-3 flex items-center justify-between gap-2 text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                                    <span>Assistant</span>
                                    {message.model ? <span>{message.model}</span> : null}
                                </div>
                                <AssistantMarkdown messageId={message.id} content={message.content} reactions={reactions} onCopy={onCopy} onReact={onReact} />
                            </div>
                        ),
                    )}
                    {isPending ? (
                        <div className="w-full rounded-xl border border-border bg-card p-4 text-sm text-mutedForeground">Thinking...</div>
                    ) : null}
                </div>
                <div className="border-t border-border bg-card p-4">
                    <div className="space-y-3">
                        <Textarea
                            value={draft}
                            onChange={(event) => onDraftChange(event.target.value)}
                            placeholder="How can I help?"
                            className="min-h-28 resize-none"
                        />
                        <div className="flex justify-end">
                            <Button onClick={onExecute} disabled={isPending || draft.trim().length === 0}>Execute</Button>
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

                const ProjectModal = ({open, onOpenChange, projects, currentProject, onSelectProject, onCreateProject}: ProjectModalProps): JSX.Element => {
    const [newProjectName, setNewProjectName] = useState("");
                const [isCreating, setIsCreating] = useState(false);
                const [errorMessage, setErrorMessage] = useState<string | null>(null);

                const handleCreate = async (): Promise<void> => {
        if (!newProjectName.trim()) {
                        setErrorMessage("Project name is required.");
                    return;
        }
                    try {
                        setIsCreating(true);
                    setErrorMessage(null);
                    await onCreateProject(newProjectName.trim());
                    setNewProjectName("");
                    onOpenChange(false);
        } catch (error) {
                        setErrorMessage(getApiErrorMessage(error));
        } finally {
                        setIsCreating(false);
        }
    };

                    return (
                    <Dialog open={open} onOpenChange={onOpenChange}>
                        <DialogContent className="max-w-3xl">
                            <DialogHeader>
                                <DialogTitle>Project</DialogTitle>
                                <DialogDescription>Create a new project workspace or load an existing one.</DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-6 md:grid-cols-2">
                                <div className="space-y-4 rounded-md border border-border bg-background p-4">
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Load Existing Project</p>
                                        <p className="mt-1 text-sm text-mutedForeground">Pick the active project for this flow canvas.</p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Existing Projects</Label>
                                        <Select value={currentProject?.id ?? undefined} onValueChange={onSelectProject}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a project" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {projects.map((project) => (
                                                    <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {currentProject ? (
                                        <div className="rounded-md border border-border bg-card p-3 text-sm text-mutedForeground">
                                            <p className="font-semibold text-slate-900 dark:text-slate-100">Current Project</p>
                                            <p className="mt-1">{currentProject.name}</p>
                                            <p className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Slug: {currentProject.slug}</p>
                                        </div>
                                    ) : null}
                                </div>
                                <div className="space-y-4 rounded-md border border-border bg-background p-4">
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Create New Project</p>
                                        <p className="mt-1 text-sm text-mutedForeground">A new project record is saved in the backend projects table.</p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="new-project-name">Project Name</Label>
                                        <Input id="new-project-name" value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="Sweeney Migration" />
                                    </div>
                                    {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}
                                    <div className="flex justify-end">
                                        <Button onClick={() => void handleCreate()}>{isCreating ? "Creating..." : "Create Project"}</Button>
                                    </div>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>
                    );
};

                    const SchemaModal = ({open, onOpenChange, project, projectConfig, onSaveConfig}: ModalProps): JSX.Element => {
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
                                                    cchSchema: {fileName: cchSchema.fileName, content: cchSchema.value },
                                                clientSchema: {fileName: clientSchema.fileName, content: clientSchema.value },
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
                                                        <div className="h-1 bg-orange-500" />
                                                        <div className="flex h-[calc(90vh-0.25rem)] flex-col p-3">
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

                                                const DiscoveryModal = ({open, onOpenChange, project, projectConfig, onSaveConfig}: ModalProps): JSX.Element => {
    const discoveryQuery = useQuery({queryKey: queryKeys.discoveryQuestions, queryFn: utilitiesApi.discoveryQuestions });
                                                const [answers, setAnswers] = useState<Record<string, string>>(projectConfig.discovery?.answers ?? { });
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
                                                            discovery: {answers},
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
                                                                    <div className="h-1 bg-emerald-500" />
                                                                    <div className="flex h-[calc(82vh-0.25rem)] flex-col p-4">
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

                                                            const HeuristicsModal = ({open, onOpenChange, project, projectConfig, onSaveConfig}: ModalProps): JSX.Element => {
    const [content, setContent] = useState("");
                                                            const [isLoading, setIsLoading] = useState(false);
                                                            const [isSaving, setIsSaving] = useState(false);
                                                            const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!open || !project) {
            return;
        }
                                                            let isActive = true;
                                                            const load = async (): Promise<void> => {
            try {
                                                                    setIsLoading(true);
                                                                setErrorMessage(null);
                                                                const response = await utilitiesApi.heuristicsText(project.slug);
                                                                if (isActive) {
                                                                    setContent(response.content);
                }
            } catch (error) {
                if (isActive) {
                                                                    setErrorMessage(getApiErrorMessage(error));
                }
            } finally {
                if (isActive) {
                                                                    setIsLoading(false);
                }
            }
        };
                                                                void load();
        return () => {
                                                                    isActive = false;
        };
    }, [open, project?.id]);

                                                                const handleSave = async (): Promise<void> => {
        if (!project) {
            return;
        }
                                                                    try {
                                                                        setIsSaving(true);
                                                                    setErrorMessage(null);
                                                                    await utilitiesApi.saveHeuristicsText(project.slug, content);
                                                                    await onSaveConfig({
                                                                        ...projectConfig,
                                                                        heuristics: {
                                                                        fileName: `${project.slug}_heuristics.txt`,
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
                                                                            <div className="h-1 bg-sky-500" />
                                                                            <div className="flex h-[calc(78vh-0.25rem)] flex-col p-4">
                                                                                <DialogHeader>
                                                                                    <DialogTitle>Heuristics</DialogTitle>
                                                                                    <DialogDescription>Edit the project heuristics plain-text file stored under the backend static heuristics folder.</DialogDescription>
                                                                                </DialogHeader>
                                                                                {!project ? <div className="mt-4"><ProjectRequiredNotice /></div> : null}
                                                                                {project ? (
                                                                                    <>
                                                                                        <div className="mt-4 rounded-md border border-border bg-background p-3 text-sm text-mutedForeground">
                                                                                            File: {project.slug}_heuristics.txt
                                                                                        </div>
                                                                                        {errorMessage ? <div className="mt-4"><Alert variant="destructive">{errorMessage}</Alert></div> : null}
                                                                                        <div className="mt-4 min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-background p-3">
                                                                                            <Textarea value={content} onChange={(event) => setContent(event.target.value)} className="h-full min-h-0 resize-none border-0 bg-transparent font-mono text-sm leading-6" placeholder={isLoading ? "Loading heuristics..." : "Enter project heuristics"} />
                                                                                        </div>
                                                                                        <div className="mt-4 flex justify-end gap-2">
                                                                                            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                                                                                            <Button onClick={() => void handleSave()} disabled={isSaving}>{isSaving ? "Saving..." : "Save Heuristics"}</Button>
                                                                                        </div>
                                                                                    </>
                                                                                ) : null}
                                                                            </div>
                                                                        </DialogContent>
                                                                    </Dialog>
                                                                    );
};

                                                                    const DbSetupModal = ({open, onOpenChange, project, projectConfig, onSaveConfig}: ModalProps): JSX.Element => {
    const [clientDb, setClientDb] = useState<DbCredentials>(projectConfig.dbSetup?.client ?? { });
                                                                        const [stagingDb, setStagingDb] = useState<DbCredentials>(projectConfig.dbSetup?.staging ?? { });
                                                                            const [isSaving, setIsSaving] = useState(false);
                                                                            const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
                                                                                setClientDb(projectConfig.dbSetup?.client ?? {});
                                                                            setStagingDb(projectConfig.dbSetup?.staging ?? { });
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
                                                                                        <div key={fieldKey} className="space-y-2">
                                                                                            <Label>{label}</Label>
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
                                                                                            <div className="h-1 bg-fuchsia-500" />
                                                                                            <div className="flex h-[calc(82vh-0.25rem)] flex-col p-4">
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
                                                                                                            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                                                                                                            <Button onClick={() => void handleSave()} disabled={isSaving}>{isSaving ? "Saving..." : "Save DB Setup"}</Button>
                                                                                                        </div>
                                                                                                    </>
                                                                                                ) : null}
                                                                                            </div>
                                                                                        </DialogContent>
                                                                                    </Dialog>
                                                                                    );
};

                                                                                    const TargetsModal = ({open, onOpenChange, project, projectConfig, onSaveConfig}: ModalProps): JSX.Element => {
    const [targets, setTargets] = useState<TargetsConfig>(projectConfig.targets ?? { });
                                                                                        const [isSaving, setIsSaving] = useState(false);
                                                                                        const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
                                                                                            setTargets(projectConfig.targets ?? {});
                                                                                        setErrorMessage(null);
    }, [project?.id, open, projectConfig.targets]);

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
                                                                                                <DialogContent className="max-w-3xl">
                                                                                                    <DialogHeader>
                                                                                                        <DialogTitle>Targets</DialogTitle>
                                                                                                        <DialogDescription>Set the client-system target values used during reconciliation.</DialogDescription>
                                                                                                    </DialogHeader>
                                                                                                    {!project ? <ProjectRequiredNotice /> : null}
                                                                                                    {project ? (
                                                                                                        <div className="space-y-4">
                                                                                                            {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}
                                                                                                            <div className="grid gap-4 md:grid-cols-2">
                                                                                                                <div className="space-y-2">
                                                                                                                    <Label>AR Balance</Label>
                                                                                                                    <Input value={targets.arBalance ?? ""} onChange={(event) => setTargets((current) => ({ ...current, arBalance: event.target.value }))} />
                                                                                                                </div>
                                                                                                                <div className="space-y-2">
                                                                                                                    <Label>WIP Balance</Label>
                                                                                                                    <Input value={targets.wipBalance ?? ""} onChange={(event) => setTargets((current) => ({ ...current, wipBalance: event.target.value }))} />
                                                                                                                </div>
                                                                                                                <div className="space-y-2">
                                                                                                                    <Label>Client Count</Label>
                                                                                                                    <Input value={targets.clientCount ?? ""} onChange={(event) => setTargets((current) => ({ ...current, clientCount: event.target.value }))} />
                                                                                                                </div>
                                                                                                                <div className="space-y-2 md:col-span-2">
                                                                                                                    <Label>Revenue By Period</Label>
                                                                                                                    <Textarea value={targets.revenueByPeriod ?? ""} onChange={(event) => setTargets((current) => ({ ...current, revenueByPeriod: event.target.value }))} placeholder="Q1=100000&#10;Q2=125000&#10;Q3=98000&#10;Q4=143000" />
                                                                                                                </div>
                                                                                                            </div>
                                                                                                            <div className="flex justify-end gap-2">
                                                                                                                <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                                                                                                                <Button onClick={() => void handleSave()} disabled={isSaving}>{isSaving ? "Saving..." : "Save Targets"}</Button>
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    ) : null}
                                                                                                </DialogContent>
                                                                                            </Dialog>
                                                                                            );
};

                                                                                            const SqlModal = ({open, onOpenChange, project, projectConfig, onSaveConfig}: ModalProps): JSX.Element => {
    const templatesQuery = useQuery({queryKey: queryKeys.sqlTemplates, queryFn: utilitiesApi.sqlTemplates });
                                                                                            const [selectedTemplates, setSelectedTemplates] = useState<string[]>(projectConfig.sql?.selectedTemplates ?? []);
                                                                                            const [isSaving, setIsSaving] = useState(false);
                                                                                            const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
                                                                                                setSelectedTemplates(projectConfig.sql?.selectedTemplates ?? []);
                                                                                            setErrorMessage(null);
    }, [project?.id, open, projectConfig.sql]);

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
                                                                                                await onSaveConfig({
                                                                                                    ...projectConfig,
                                                                                                    sql: {selectedTemplates},
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
                                                                                                    <DialogContent className="h-[84vh] w-[72vw] max-w-none overflow-hidden rounded-lg border border-border bg-card p-0">
                                                                                                        <div className="h-1 bg-red-500" />
                                                                                                        <div className="flex h-[calc(84vh-0.25rem)] flex-col p-4">
                                                                                                            <DialogHeader>
                                                                                                                <DialogTitle>SQL</DialogTitle>
                                                                                                                <DialogDescription>Review the SQL files from the backend static templates folder and mark the ones to execute later.</DialogDescription>
                                                                                                            </DialogHeader>
                                                                                                            {!project ? <div className="mt-4"><ProjectRequiredNotice /></div> : null}
                                                                                                            {project ? (
                                                                                                                <>
                                                                                                                    {templatesQuery.error ? <div className="mt-4"><Alert variant="destructive">{getApiErrorMessage(templatesQuery.error)}</Alert></div> : null}
                                                                                                                    {errorMessage ? <div className="mt-4"><Alert variant="destructive">{errorMessage}</Alert></div> : null}
                                                                                                                    <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-auto pr-2">
                                                                                                                        {(templatesQuery.data ?? []).map((template: SqlTemplate) => (
                                                                                                                            <div key={template.name} className="rounded-md border border-border bg-background p-4">
                                                                                                                                <label className="flex items-center gap-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                                                                                                                                    <input type="checkbox" checked={selectedTemplates.includes(template.name)} onChange={() => toggleTemplate(template.name)} className="h-4 w-4" />
                                                                                                                                    {template.name}
                                                                                                                                </label>
                                                                                                                                <details className="mt-3">
                                                                                                                                    <summary className="cursor-pointer text-sm text-primary">Show SQL</summary>
                                                                                                                                    <pre className="mt-3 overflow-auto rounded-md border border-border bg-card p-3 text-xs leading-6 text-mutedForeground">{template.content}</pre>
                                                                                                                                </details>
                                                                                                                            </div>
                                                                                                                        ))}
                                                                                                                    </div>
                                                                                                                    <div className="mt-4 flex justify-end gap-2">
                                                                                                                        <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                                                                                                                        <Button variant="outline" disabled>Execute</Button>
                                                                                                                        <Button onClick={() => void handleSave()} disabled={isSaving}>{isSaving ? "Saving..." : "Save SQL Selection"}</Button>
                                                                                                                    </div>
                                                                                                                </>
                                                                                                            ) : null}
                                                                                                        </div>
                                                                                                    </DialogContent>
                                                                                                </Dialog>
                                                                                                );
};

                                                                                                const GenTestLoopModal = ({open, onOpenChange, project, projectConfig, onSaveConfig}: ModalProps): JSX.Element => {
    const [values, setValues] = useState<GenTestLoopConfig>(projectConfig.genTestLoop ?? { });
                                                                                                    const [isSaving, setIsSaving] = useState(false);
                                                                                                    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
                                                                                                        setValues(projectConfig.genTestLoop ?? {});
                                                                                                    setErrorMessage(null);
    }, [project?.id, open, projectConfig.genTestLoop]);

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
                                                                                                                        <div className="flex justify-end gap-2">
                                                                                                                            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                                                                                                                            <Button onClick={() => void handleSave()} disabled={isSaving}>{isSaving ? "Saving..." : "Save Loop Config"}</Button>
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
                                                                                                            const [activeStep, setActiveStep] = useState<StepId | null>(null);
                                                                                                            const [chatOpen, setChatOpen] = useState(false);
                                                                                                            const [chatDraft, setChatDraft] = useState("");
                                                                                                            const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
                                                                                                            const [chatReactions, setChatReactions] = useState<Record<string, ChatReaction | undefined>>({ });
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

                                                                                                                        const projectsQuery = useQuery({queryKey: queryKeys.projects, queryFn: projectsApi.list });
                                                                                                                        const currentProjectQuery = useQuery({
                                                                                                                            queryKey: currentProjectId ? queryKeys.project(currentProjectId) : ["project", "none"],
        queryFn: () => projectsApi.detail(currentProjectId as string),
                                                                                                                        enabled: Boolean(currentProjectId),
    });

                                                                                                                        const createProjectMutation = useMutation({
                                                                                                                            mutationFn: (payload: Record<string, unknown>) => projectsApi.create(payload),
        onSuccess: (project) => {
                                                                                                                            queryClient.setQueryData(queryKeys.project(project.id), project);
        },
    });

                                                                                                                        const updateProjectMutation = useMutation({
                                                                                                                            mutationFn: ({projectId, payload}: {projectId: string; payload: Record<string, unknown> }) => projectsApi.update(projectId, payload),
        onSuccess: (project) => {
                                                                                                                            queryClient.setQueryData(queryKeys.project(project.id), project);
        },
    });

                                                                                                                        const chatMutation = useMutation({
                                                                                                                            mutationFn: (payload: {prompt: string; provider: LlmProvider }) => llmApi.prompt(payload.prompt, payload.provider),
        onSuccess: (result: LLMPromptResponse) => {
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
        const frameId = window.requestAnimationFrame(() => {
                                                                                                                            reactFlowRef.current?.fitView({
                                                                                                                                padding: chatOpen ? 0.3 : 0.24,
                                                                                                                                minZoom: 0.6,
                                                                                                                                maxZoom: 1.05,
                                                                                                                                duration: 260,
                                                                                                                            });
        });
        return () => window.cancelAnimationFrame(frameId);
    }, [chatOpen]);

                                                                                                                        const currentProject = currentProjectQuery.data ?? null;
                                                                                                                        const projectConfig = normalizeProjectConfig(currentProject?.config as Record<string, unknown> | undefined);

                                                                                                                        const saveProjectConfig = async (nextConfig: ProjectConfig): Promise<void> => {
        if (!currentProject) {
            return;
        }
                                                                                                                            const updatedProject = await updateProjectMutation.mutateAsync({
                                                                                                                                projectId: currentProject.id,
                                                                                                                            payload: {config: nextConfig },
        });
                                                                                                                            queryClient.setQueryData(queryKeys.project(updatedProject.id), updatedProject);
                                                                                                                            await queryClient.invalidateQueries({queryKey: queryKeys.projects });
    };

                                                                                                                            const handleCreateProject = async (name: string): Promise<void> => {
        const createdProject = await createProjectMutation.mutateAsync({name, config: { } });
                                                                                                                                await queryClient.invalidateQueries({queryKey: queryKeys.projects });
                                                                                                                                setCurrentProjectId(createdProject.id);
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
                                                                                                                                queryClient.removeQueries({queryKey: queryKeys.me, exact: true });
                                                                                                                                setCurrentUser(null);
                                                                                                                                setSettingsOpen(false);
    };

    const handleExecuteChat = (): void => {
        const prompt = chatDraft.trim();
                                                                                                                                if (!prompt) {
            return;
        }
        setPromptHistory((current) => [prompt, ...current].slice(0, CHAT_PROMPT_HISTORY_LIMIT));
                                                                                                                                setPromptHistoryCursor(-1);
        setChatMessages((current) => [
                                                                                                                                ...current,
                                                                                                                                {
                                                                                                                                    id: `user-${Date.now()}`,
                                                                                                                                role: "user",
                                                                                                                                content: prompt,
            },
                                                                                                                                ]);
                                                                                                                                setChatDraft("");
                                                                                                                                chatMutation.mutate({prompt, provider: llmProvider });
    };

                                                                                                                                const handleChatDraftKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
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
                onOpen: (stepId) => setActiveStep(stepId),
            },
        }));
    }, [currentProject, projectConfig]);

                                                                                                                                        const configuredCount = getConfiguredCount(currentProject);

                                                                                                                                        return (
                                                                                                                                        <div className="h-screen overflow-hidden bg-background p-4">
                                                                                                                                            <div className="mx-auto flex h-full w-full overflow-hidden rounded-lg border border-border bg-card shadow-panel">
                                                                                                                                                <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
                                                                                                                                                    <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-3">
                                                                                                                                                        <div className="space-y-2">
                                                                                                                                                            <div className="flex flex-wrap items-center gap-2">
                                                                                                                                                                <Badge variant="info">Project Migrate</Badge>
                                                                                                                                                                <Badge variant={configuredCount >= 5 ? "success" : "warning"}>{configuredCount} steps configured</Badge>
                                                                                                                                                                <Badge variant="outline">{currentProject ? currentProject.name : "No project loaded"}</Badge>
                                                                                                                                                                <Badge variant="outline">LLM: {llmProvider === "deepseek" ? "DeepSeek" : "OpenAI"}</Badge>
                                                                                                                                                            </div>
                                                                                                                                                            <div>
                                                                                                                                                                <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50 md:text-3xl">Migration flow canvas</h1>
                                                                                                                                                                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 md:text-base">Each node opens a project-backed modal for the main migration inputs.</p>
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
                                                                                                                                                    <div className="min-h-0 flex-1 bg-background">
                                                                                                                                                        {projectsQuery.error ? <div className="m-4"><Alert variant="destructive">{getApiErrorMessage(projectsQuery.error)}</Alert></div> : null}
                                                                                                                                                        {currentProjectQuery.error ? <div className="m-4"><Alert variant="destructive">{getApiErrorMessage(currentProjectQuery.error)}</Alert></div> : null}
                                                                                                                                                        <div className="flex h-full min-w-0">
                                                                                                                                                            <div className="min-w-0 flex-1">
                                                                                                                                                                <ReactFlow
                                                                                                                                                                    nodes={nodes}
                                                                                                                                                                    edges={initialEdges}
                                                                                                                                                                    nodeTypes={nodeTypes}
                                                                                                                                                                    onInit={(instance) => {
                                                                                                                                                                        reactFlowRef.current = instance;
                                                                                                                                                                    }}
                                                                                                                                                                    fitView
                                                                                                                                                                    fitViewOptions={{ padding: chatOpen ? 0.3 : 0.24, minZoom: 0.7, maxZoom: 1.05 }}
                                                                                                                                                                    minZoom={0.6}
                                                                                                                                                                    maxZoom={1.2}
                                                                                                                                                                    panOnScroll={false}
                                                                                                                                                                    zoomOnScroll={false}
                                                                                                                                                                    nodesDraggable={false}
                                                                                                                                                                    elementsSelectable={false}
                                                                                                                                                                    proOptions={{ hideAttribution: true }}
                                                                                                                                                                    className="h-full w-full"
                                                                                                                                                                >
                                                                                                                                                                    <Background gap={20} size={1} color="#cbd5e1" />
                                                                                                                                                                    <Controls showInteractive={false} position="bottom-right" />
                                                                                                                                                                </ReactFlow>
                                                                                                                                                            </div>
                                                                                                                                                            <ChatPanel
                                                                                                                                                                open={chatOpen}
                                                                                                                                                                onToggle={() => setChatOpen(false)}
                                                                                                                                                                messages={chatMessages}
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
                                                                                                                                            />
                                                                                                                                            <SchemaModal open={activeStep === "step-2"} onOpenChange={(open) => setActiveStep(open ? "step-2" : null)} project={currentProject} projectConfig={projectConfig} onSaveConfig={saveProjectConfig} />
                                                                                                                                            <DiscoveryModal open={activeStep === "step-3"} onOpenChange={(open) => setActiveStep(open ? "step-3" : null)} project={currentProject} projectConfig={projectConfig} onSaveConfig={saveProjectConfig} />
                                                                                                                                            <HeuristicsModal open={activeStep === "step-4"} onOpenChange={(open) => setActiveStep(open ? "step-4" : null)} project={currentProject} projectConfig={projectConfig} onSaveConfig={saveProjectConfig} />
                                                                                                                                            <DbSetupModal open={activeStep === "step-5"} onOpenChange={(open) => setActiveStep(open ? "step-5" : null)} project={currentProject} projectConfig={projectConfig} onSaveConfig={saveProjectConfig} />
                                                                                                                                            <TargetsModal open={activeStep === "step-6"} onOpenChange={(open) => setActiveStep(open ? "step-6" : null)} project={currentProject} projectConfig={projectConfig} onSaveConfig={saveProjectConfig} />
                                                                                                                                            <SqlModal open={activeStep === "step-7"} onOpenChange={(open) => setActiveStep(open ? "step-7" : null)} project={currentProject} projectConfig={projectConfig} onSaveConfig={saveProjectConfig} />
                                                                                                                                            <GenTestLoopModal open={activeStep === "step-8"} onOpenChange={(open) => setActiveStep(open ? "step-8" : null)} project={currentProject} projectConfig={projectConfig} onSaveConfig={saveProjectConfig} />

                                                                                                                                            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                                                                                                                                                <DialogContent className="max-w-3xl">
                                                                                                                                                    <DialogHeader>
                                                                                                                                                        <DialogTitle>Workspace Settings</DialogTitle>
                                                                                                                                                        <DialogDescription>Set the current demo user, active LLM provider, and canvas theme.</DialogDescription>
                                                                                                                                                    </DialogHeader>
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