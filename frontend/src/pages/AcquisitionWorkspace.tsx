import type { JSX } from "react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ArtifactDrawer } from "@/components/layout/ArtifactDrawer";
import { PageHeader } from "@/components/layout/PageHeader";
import { StageStepper } from "@/components/layout/StageStepper";
import { Stage1Result } from "@/components/stages/Stage1Result";
import { Stage1Upload } from "@/components/stages/Stage1Upload";
import { Stage2Enrichment } from "@/components/stages/Stage2Enrichment";
import { Stage3Discovery } from "@/components/stages/Stage3Discovery";
import { Stage4Manifest } from "@/components/stages/Stage4Manifest";
import { Stage5Generate } from "@/components/stages/Stage5Generate";
import { Stage6Validation } from "@/components/stages/Stage6Validation";
import { Stage7Output } from "@/components/stages/Stage7Output";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
    useAcquisitionDetail,
    useAcquisitionFiles,
    useArtifacts,
    useDiscovery,
    useManifest,
    useRunStage,
    useStageArtifact,
    useStageStatus,
    useUpdateDiscovery,
    useUploadFiles,
    useUpsertManifestOverride,
} from "@/hooks/useAcquisitions";
import { useJobLogStream } from "@/hooks/useJobLogStream";
import { acquisitionsApi, getApiErrorMessage } from "@/lib/api";

const stageForArtifact = (stage: number): number => stage;

export const AcquisitionWorkspace = (): JSX.Element => {
    const { id = "" } = useParams();
    const navigate = useNavigate();
    const [activeStage, setActiveStage] = useState<number>(1);
    const [drawerOpen, setDrawerOpen] = useState(false);

    const acquisitionQuery = useAcquisitionDetail(id);
    const filesQuery = useAcquisitionFiles(id);
    const artifactsQuery = useArtifacts(id);
    const discoveryQuery = useDiscovery(id);
    const manifestQuery = useManifest(id);

    const runStageMutation = useRunStage(id);
    const uploadMutation = useUploadFiles(id);
    const updateDiscoveryMutation = useUpdateDiscovery(id);
    const saveOverrideMutation = useUpsertManifestOverride(id);

    const acquisition = acquisitionQuery.data;
    const effectiveStage = acquisition ? Math.max(activeStage, Math.min(acquisition.current_stage, 7)) : activeStage;
    const stageStatusQuery = useStageStatus(id, effectiveStage, Boolean(acquisition));
    const stageArtifactQuery = useStageArtifact(id, stageForArtifact(effectiveStage), Boolean(acquisition));
    const jobId = stageStatusQuery.data?.job?.id ?? null;
    const { lines: logLines, status: streamStatus } = useJobLogStream(jobId, Boolean(jobId));

    const handleRunStage = (stage: number): void => {
        runStageMutation.mutate(stage, {
            onSuccess: () => {
                setActiveStage(stage);
            },
        });
    };

    const artifactContent = (stageArtifactQuery.data?.content as Record<string, unknown> | null | undefined) ?? null;
    const currentError = acquisitionQuery.error || filesQuery.error || artifactsQuery.error || discoveryQuery.error || manifestQuery.error;

    const renderStage = (): JSX.Element => {
        switch (effectiveStage) {
            case 1:
                return artifactContent ? (
                    <Stage1Result artifactContent={artifactContent} onRunStage={handleRunStage} isRunning={runStageMutation.isPending} />
                ) : (
                    <Stage1Upload
                        files={filesQuery.data ?? []}
                        onUpload={(files) => uploadMutation.mutateAsync(files)}
                        onRunStage={handleRunStage}
                        isUploading={uploadMutation.isPending}
                        isRunning={runStageMutation.isPending}
                    />
                );
            case 2:
                return <Stage2Enrichment artifactContent={artifactContent} logLines={logLines} streamStatus={streamStatus} onRunStage={handleRunStage} isRunning={runStageMutation.isPending} />;
            case 3:
                return (
                    <Stage3Discovery
                        answers={discoveryQuery.data ?? []}
                        historicalYears={acquisition?.historical_years ?? 3}
                        onHistoricalYearsChange={(value) => {
                            void acquisitionsApi.update(id, { historical_years: value });
                        }}
                        onUpdateAnswer={(questionKey, answer) => updateDiscoveryMutation.mutate({ questionKey, answer })}
                        onRunStage={handleRunStage}
                        isRunning={runStageMutation.isPending}
                    />
                );
            case 4:
                return (
                    <Stage4Manifest
                        manifest={(manifestQuery.data as Record<string, unknown> | null) ?? null}
                        onSaveOverride={(payload) => saveOverrideMutation.mutate(payload)}
                        onRunStage={handleRunStage}
                        isRunning={runStageMutation.isPending}
                    />
                );
            case 5:
                return (
                    <Stage5Generate
                        acquisitionId={id}
                        artifactContent={artifactContent}
                        artifactId={stageArtifactQuery.data?.id ?? null}
                        logLines={logLines}
                        streamStatus={streamStatus}
                        onRunStage={handleRunStage}
                        isRunning={runStageMutation.isPending}
                    />
                );
            case 6:
                return (
                    <Stage6Validation
                        report={artifactContent}
                        onRunStage={handleRunStage}
                        onJumpToManifest={() => setActiveStage(4)}
                        isRunning={runStageMutation.isPending}
                    />
                );
            case 7: {
                const artifacts = artifactsQuery.data ?? [];
                const excelArtifact = artifacts.find((artifact) => artifact.artifact_type === "cch_excel_output");
                const flatFileArtifact = artifacts.find((artifact) => artifact.artifact_type === "cch_flat_files");
                return <Stage7Output acquisitionId={id} excelArtifact={excelArtifact} flatFileArtifact={flatFileArtifact} onRunStage={handleRunStage} isRunning={runStageMutation.isPending} />;
            }
            default:
                return <Card><CardContent className="pt-6">Unknown stage.</CardContent></Card>;
        }
    };

    if (acquisitionQuery.isLoading || !acquisition) {
        return <Skeleton className="h-[70vh] w-full rounded-[1.75rem]" />;
    }

    return (
        <div className="space-y-8">
            <PageHeader title={acquisition.name} description="Operate the migration pipeline, review human gates, and download generated artifacts from one stateful workspace." />
            {currentError ? <Alert variant="destructive">{getApiErrorMessage(currentError)}</Alert> : null}
            <div className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
                <div>
                    <StageStepper acquisition={acquisition} activeStage={effectiveStage} onStageSelect={setActiveStage} />
                </div>
                <div className="relative min-w-0">
                    <ArtifactDrawer acquisitionId={id} artifacts={artifactsQuery.data ?? []} open={drawerOpen} onToggle={() => setDrawerOpen((current) => !current)} />
                    {renderStage()}
                </div>
            </div>
        </div>
    );
};
