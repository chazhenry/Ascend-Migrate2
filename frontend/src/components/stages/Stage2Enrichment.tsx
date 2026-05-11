import type { JSX } from "react";
import { useMemo, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Stage2EnrichmentProps {
    artifactContent: Record<string, unknown> | null;
    logLines: string[];
    streamStatus: string;
    onRunStage: (stage: number) => void;
    isRunning: boolean;
}

interface EnrichedRow {
    table: string;
    column: string;
    dataType: string;
    description: string;
    commonNames: string;
    exampleValues: string;
    transformationNotes: string;
}

const flattenSchema = (artifactContent: Record<string, unknown> | null): EnrichedRow[] => {
    if (!artifactContent) {
        return [];
    }
    return Object.entries(artifactContent).flatMap(([tableName, value]) => {
        const tablePayload = value as { columns?: Array<Record<string, unknown>> };
        return (tablePayload.columns ?? []).map((column) => ({
            table: tableName,
            column: String(column.column_name ?? ""),
            dataType: String(column.data_type ?? ""),
            description: String(column.description ?? ""),
            commonNames: Array.isArray(column.common_source_names) ? column.common_source_names.join(", ") : "",
            exampleValues: Array.isArray(column.example_values) ? column.example_values.join(", ") : "",
            transformationNotes: String(column.transformation_notes ?? ""),
        }));
    });
};

export const Stage2Enrichment = ({ artifactContent, logLines, streamStatus, onRunStage, isRunning }: Stage2EnrichmentProps): JSX.Element => {
    const [search, setSearch] = useState("");
    const rows = useMemo(() => flattenSchema(artifactContent), [artifactContent]);
    const filteredRows = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) {
            return rows;
        }
        return rows.filter((row) => Object.values(row).some((value) => value.toLowerCase().includes(query)));
    }, [rows, search]);

    return (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <Card>
                <CardHeader>
                    <CardTitle>Enriched Source Schema</CardTitle>
                    <CardDescription>Search and review AI-enriched source fields. Rows with inferred descriptions are highlighted.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <Input placeholder="Search by table, column, or description" value={search} onChange={(event) => setSearch(event.target.value)} />
                        <Button onClick={() => onRunStage(3)} disabled={isRunning || rows.length === 0}>{isRunning ? "Running..." : "Generate Discovery Questions →"}</Button>
                    </div>
                    <ScrollArea className="h-[560px] rounded-2xl border border-border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Table</TableHead>
                                    <TableHead>Column</TableHead>
                                    <TableHead>Data Type</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead>Common Names</TableHead>
                                    <TableHead>Example Values</TableHead>
                                    <TableHead>Transformation Notes</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredRows.map((row) => {
                                    const isInferred = row.description.toLowerCase().includes("unknown") || row.description.toLowerCase().includes("inferred");
                                    return (
                                        <TableRow key={`${row.table}-${row.column}`} className={isInferred ? "bg-warning/12" : undefined}>
                                            <TableCell className="font-medium">{row.table}</TableCell>
                                            <TableCell>{row.column}</TableCell>
                                            <TableCell>{row.dataType}</TableCell>
                                            <TableCell>{row.description}</TableCell>
                                            <TableCell>{row.commonNames}</TableCell>
                                            <TableCell>{row.exampleValues}</TableCell>
                                            <TableCell>{row.transformationNotes}</TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Live AI Progress</CardTitle>
                    <CardDescription>Streaming stage log from the backend job record.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Badge variant={streamStatus === "error" ? "destructive" : streamStatus === "done" ? "success" : "info"}>{streamStatus}</Badge>
                        <span className="text-sm text-mutedForeground">{logLines.length} log lines</span>
                    </div>
                    {streamStatus === "error" ? <Alert variant="destructive">The log stream disconnected before completion.</Alert> : null}
                    <ScrollArea className="h-[500px] rounded-2xl border border-border bg-slate-950 p-4 text-sm text-slate-100">
                        <pre className="font-mono whitespace-pre-wrap">{logLines.join("\n") || "Waiting for job output..."}</pre>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
};
