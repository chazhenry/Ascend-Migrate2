import type { JSX } from "react";
import { CheckCircle2, Circle, LoaderCircle, OctagonAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { AcquisitionDetail } from "@/types/api";

interface StageStepperProps {
    acquisition: AcquisitionDetail;
    activeStage: number;
    onStageSelect: (stage: number) => void;
}

const stageDefinitions = [
    { number: 1, name: "Upload & Detect" },
    { number: 2, name: "Schema Enrichment" },
    { number: 3, name: "Discovery" },
    { number: 4, name: "Reconciliation Targets" },
    { number: 5, name: "SQL Generation" },
    { number: 6, name: "Validation" },
    { number: 7, name: "Output" },
];

const renderIcon = (stage: number, acquisition: AcquisitionDetail): JSX.Element => {
    if (acquisition.stage_status === "running" && acquisition.current_stage === stage) {
        return <LoaderCircle className="h-4 w-4 animate-spin text-info" />;
    }
    if (acquisition.stage_status === "blocked" && acquisition.current_stage === stage) {
        return <OctagonAlert className="h-4 w-4 text-destructive" />;
    }
    if (acquisition.current_stage > stage || (acquisition.current_stage === stage && acquisition.stage_status === "complete")) {
        return <CheckCircle2 className="h-4 w-4 text-success" />;
    }
    if (acquisition.stage_status === "awaiting_review" && acquisition.current_stage === stage) {
        return <div className="h-3 w-3 rounded-full bg-warning" />;
    }
    return <Circle className="h-4 w-4 text-mutedForeground" />;
};

export const StageStepper = ({ acquisition, activeStage, onStageSelect }: StageStepperProps): JSX.Element => {
    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-background/65 p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-mutedForeground">Acquisition</p>
                <h2 className="mt-2 text-xl font-semibold">{acquisition.name}</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="info">{acquisition.source_system ?? "Awaiting detection"}</Badge>
                    <Badge variant="outline">Stage {acquisition.current_stage}</Badge>
                </div>
            </div>
            <div className="space-y-2">
                {stageDefinitions.map((stage) => {
                    const isInteractive = stage.number <= acquisition.current_stage;
                    const isActive = activeStage === stage.number;
                    return (
                        <button
                            type="button"
                            key={stage.number}
                            className={[
                                "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition",
                                isActive ? "border-foreground bg-foreground text-background" : "border-border bg-background/40 hover:bg-muted",
                                !isInteractive ? "opacity-70" : "",
                            ].join(" ")}
                            onClick={() => isInteractive && onStageSelect(stage.number)}
                        >
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-background/75 text-foreground">
                                {renderIcon(stage.number, acquisition)}
                            </div>
                            <div>
                                <p className="text-xs uppercase tracking-[0.2em] opacity-70">Stage {stage.number}</p>
                                <p className="text-sm font-semibold">{stage.name}</p>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
