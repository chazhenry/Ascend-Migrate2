import type { JSX } from "react";
import { Download, FolderOpen } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { artifactsApi } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import type { Artifact } from "@/types/api";

interface ArtifactDrawerProps {
    acquisitionId: string;
    artifacts: Artifact[];
    open: boolean;
    onToggle: () => void;
}

export const ArtifactDrawer = ({ acquisitionId, artifacts, open, onToggle }: ArtifactDrawerProps): JSX.Element => {
    return (
        <>
            <Button variant="secondary" className="fixed right-6 top-6 z-30 shadow-panel" onClick={onToggle}>
                <FolderOpen className="h-4 w-4" />
                Artifact Drawer
            </Button>
            {open ? (
                <aside className="fixed right-4 top-20 z-20 h-[calc(100vh-6rem)] w-[min(360px,92vw)] rounded-lg border border-border bg-card p-4 shadow-panel">
                    <Card className="h-full border-none bg-transparent shadow-none">
                        <CardHeader className="px-2 pb-4 pt-2">
                            <CardTitle>Artifacts</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[calc(100%-5rem)] px-2 pb-2 pt-0">
                            <ScrollArea className="h-full pr-2">
                                <div className="space-y-3">
                                    {artifacts.length === 0 ? <p className="text-sm text-mutedForeground">No artifacts generated yet.</p> : null}
                                    {artifacts.map((artifact) => (
                                        <div key={artifact.id} className="rounded-md border border-border bg-background p-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="space-y-1">
                                                    <p className="text-sm font-semibold capitalize">{artifact.artifact_type.replace(/_/g, " ")}</p>
                                                    <p className="text-xs text-mutedForeground">Stage {artifact.stage} · v{artifact.version}</p>
                                                    <p className="text-xs text-mutedForeground">{formatDateTime(artifact.created_at)}</p>
                                                </div>
                                                <Badge variant="outline">#{artifact.stage}</Badge>
                                            </div>
                                            {artifact.file_path ? (
                                                <a href={artifactsApi.downloadUrl(acquisitionId, artifact.id)} className="mt-3 inline-flex">
                                                    <Button variant="outline" size="sm">
                                                        <Download className="h-4 w-4" />
                                                        Download
                                                    </Button>
                                                </a>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </aside>
            ) : null}
        </>
    );
};
