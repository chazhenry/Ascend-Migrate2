import type { JSX } from "react";
import { useMemo, useState } from "react";
import { Download, Filter } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

interface ManifestField {
    target_field: string;
    required: boolean;
    source_field: string | null;
    transformation: string;
    confidence: number;
    review_flag: boolean;
    confidence_rationale: string;
    staging_reference: string | null;
    discovery_reference: string | null;
    value_map: Record<string, unknown> | null;
}

interface ManifestEntity {
    destination_entity: string;
    source_table: string | null;
    join_path: string | null;
    confidence: string;
    fields: ManifestField[];
}

interface Stage4ManifestProps {
    manifest: Record<string, unknown> | null;
    onSaveOverride: (payload: Record<string, unknown>) => void;
    onRunStage: (stage: number) => void;
    isRunning: boolean;
}

export const Stage4Manifest = ({ manifest, onSaveOverride, onRunStage, isRunning }: Stage4ManifestProps): JSX.Element => {
    const [filter, setFilter] = useState("all");
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [draftTransformation, setDraftTransformation] = useState("");
    const entities = (manifest?.entities as ManifestEntity[] | undefined) ?? [];
    const gaps = (manifest?.gaps as Array<Record<string, unknown>> | undefined) ?? [];

    const rows = useMemo(
        () =>
            entities.flatMap((entity) =>
                entity.fields.map((field) => ({
                    entity: entity.destination_entity,
                    joinPath: entity.join_path,
                    ...field,
                })),
            ),
        [entities],
    );

    const filteredRows = rows.filter((row) => {
        if (filter === "requires_review") {
            return row.review_flag;
        }
        if (filter === "low_confidence") {
            return row.confidence < 0.7;
        }
        if (filter === "unresolved") {
            return !row.source_field;
        }
        return true;
    });

    const counts = {
        high: rows.filter((row) => row.confidence >= 0.85).length,
        medium: rows.filter((row) => row.confidence >= 0.7 && row.confidence < 0.85).length,
        low: rows.filter((row) => row.confidence < 0.7).length,
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Human Gate 1 · Mapping Manifest</CardTitle>
                    <CardDescription>Review low-confidence mappings, unresolved fields, and any transformation rules before code generation.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex flex-wrap gap-2">
                            <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>All</Button>
                            <Button variant={filter === "requires_review" ? "default" : "outline"} size="sm" onClick={() => setFilter("requires_review")}>Requires Review</Button>
                            <Button variant={filter === "low_confidence" ? "default" : "outline"} size="sm" onClick={() => setFilter("low_confidence")}>Low Confidence</Button>
                            <Button variant={filter === "unresolved" ? "default" : "outline"} size="sm" onClick={() => setFilter("unresolved")}>Unresolved</Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Badge variant="success">High {counts.high}</Badge>
                            <Badge variant="warning">Medium {counts.medium}</Badge>
                            <Badge variant="destructive">Low {counts.low}</Badge>
                        </div>
                    </div>
                    <ScrollArea className="h-[480px] rounded-2xl border border-border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Destination Entity</TableHead>
                                    <TableHead>Destination Field</TableHead>
                                    <TableHead>Required</TableHead>
                                    <TableHead>Source Field</TableHead>
                                    <TableHead>Transformation</TableHead>
                                    <TableHead>Confidence</TableHead>
                                    <TableHead>Review Flag</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredRows.map((row) => {
                                    const key = `${row.entity}-${row.target_field}`;
                                    const expanded = expandedKey === key;
                                    return (
                                        <>
                                            <TableRow key={key} className={row.review_flag ? "bg-warning/10" : undefined}>
                                                <TableCell className="font-medium">{row.entity}</TableCell>
                                                <TableCell>
                                                    <button type="button" className="text-left underline-offset-4 hover:underline" onClick={() => { setExpandedKey(expanded ? null : key); setDraftTransformation(row.transformation); }}>
                                                        {row.target_field}
                                                    </button>
                                                </TableCell>
                                                <TableCell>{row.required ? "Yes" : "No"}</TableCell>
                                                <TableCell>{row.source_field ?? "Unresolved"}</TableCell>
                                                <TableCell>{row.transformation}</TableCell>
                                                <TableCell>
                                                    <Badge variant={row.confidence >= 0.85 ? "success" : row.confidence >= 0.7 ? "warning" : "destructive"}>{Math.round(row.confidence * 100)}%</Badge>
                                                </TableCell>
                                                <TableCell>{row.review_flag ? "Needs review" : "Clear"}</TableCell>
                                            </TableRow>
                                            {expanded ? (
                                                <TableRow key={`${key}-detail`}>
                                                    <TableCell colSpan={7}>
                                                        <div className="grid gap-4 rounded-2xl border border-border bg-background/60 p-4 lg:grid-cols-2">
                                                            <div className="space-y-2 text-sm">
                                                                <p><strong>Join path:</strong> {row.joinPath ?? "--"}</p>
                                                                <p><strong>Confidence rationale:</strong> {row.confidence_rationale}</p>
                                                                <p><strong>Staging reference:</strong> {row.staging_reference ?? "--"}</p>
                                                                <p><strong>Discovery reference:</strong> {row.discovery_reference ?? "--"}</p>
                                                            </div>
                                                            <div className="space-y-3">
                                                                <Textarea value={draftTransformation} onChange={(event) => setDraftTransformation(event.target.value)} />
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() =>
                                                                        onSaveOverride({
                                                                            target_entity: row.entity,
                                                                            target_field: row.target_field,
                                                                            original_value: row,
                                                                            override_value: { transformation: draftTransformation },
                                                                        })
                                                                    }
                                                                >
                                                                    Save Override
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ) : null}
                                        </>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                    {gaps.length > 0 ? (
                        <div className="space-y-3">
                            <p className="text-sm font-semibold text-destructive">Unresolved gaps</p>
                            <div className="grid gap-3 md:grid-cols-2">
                                {gaps.map((gap, index) => (
                                    <div key={`${String(gap.destination_entity)}-${index}`} className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                                        <p className="font-semibold">{String(gap.destination_entity)} · {String(gap.destination_field)}</p>
                                        <p className="mt-1">{String(gap.reason)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}
                    <div className="flex flex-wrap gap-3">
                        <Button onClick={() => onRunStage(5)} disabled={isRunning}>{isRunning ? "Generating..." : "Approve & Generate Code"}</Button>
                        <Button variant="outline">
                            <Download className="h-4 w-4" />
                            Export for Offline Review
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
