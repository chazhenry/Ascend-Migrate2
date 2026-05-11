import type { JSX } from "react";
import { Download, FileCode2, Play } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { artifactsApi } from "@/lib/api";

interface Stage5GenerateProps {
    acquisitionId: string;
    artifactContent: Record<string, unknown> | null;
    artifactId: string | null;
    logLines: string[];
    streamStatus: string;
    onRunStage: (stage: number) => void;
    isRunning: boolean;
}

export const Stage5Generate = ({ acquisitionId, artifactContent, artifactId, logLines, streamStatus, onRunStage, isRunning }: Stage5GenerateProps): JSX.Element => {
    const runSummary = Array.isArray(artifactContent?.run_summary) ? artifactContent?.run_summary as Array<Record<string, unknown>> : [];
    const scriptNames = runSummary.map((item) => `${String(item.entity).toLowerCase()}.py`);

    return (
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <Card>
                <CardHeader>
                    <CardTitle>Generated Scripts</CardTitle>
                    <CardDescription>One standalone Python file per destination entity.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-3">
                        {scriptNames.map((name) => (
                            <div key={name} className="rounded-2xl border border-border bg-background/60 p-4">
                                <div className="flex items-center gap-3">
                                    <FileCode2 className="h-5 w-5 text-primary" />
                                    <p className="font-medium">{name}</p>
                                </div>
                                <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-4 font-mono text-xs text-slate-100">{`# ${name}\n# Generated ETL script preview available in downloaded zip.`}</pre>
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-3">
                        {artifactId ? (
                            <a href={artifactsApi.downloadUrl(acquisitionId, artifactId)} className="inline-flex">
                                <Button variant="outline">
                                    <Download className="h-4 w-4" />
                                    Download All Scripts
                                </Button>
                            </a>
                        ) : null}
                        <Button onClick={() => onRunStage(5)} disabled={isRunning}>
                            <Play className="h-4 w-4" />
                            {isRunning ? "Running ETL..." : "Run ETL"}
                        </Button>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Execution Log</CardTitle>
                    <CardDescription>Live stream plus per-entity run summary.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Badge variant={streamStatus === "error" ? "destructive" : streamStatus === "done" ? "success" : "info"}>{streamStatus}</Badge>
                    <ScrollArea className="h-[360px] rounded-2xl border border-border bg-slate-950 p-4 text-slate-100">
                        <pre className="font-mono whitespace-pre-wrap text-xs">{logLines.join("\n") || "Waiting for ETL output..."}</pre>
                    </ScrollArea>
                    <div className="grid gap-3 md:grid-cols-2">
                        {runSummary.map((summary) => (
                            <div key={String(summary.entity)} className="rounded-2xl border border-border bg-background/60 p-4 text-sm">
                                <p className="font-semibold">{String(summary.entity)}</p>
                                <p className="mt-1 text-mutedForeground">Rows processed: {String(summary.rows_processed ?? 0)}</p>
                                <p className="text-mutedForeground">Rows dropped: {String(summary.rows_dropped ?? 0)}</p>
                                <p className="text-mutedForeground">Rows warned: {String(summary.rows_warned ?? 0)}</p>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
