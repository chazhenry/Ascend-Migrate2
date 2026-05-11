import type { JSX } from "react";
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Stage1ResultProps {
    artifactContent: Record<string, unknown> | null;
    onRunStage: (stage: number) => void;
    isRunning: boolean;
}

const confidenceVariant = (confidence: number): "success" | "warning" | "destructive" => {
    if (confidence >= 0.85) {
        return "success";
    }
    if (confidence >= 0.6) {
        return "warning";
    }
    return "destructive";
};

export const Stage1Result = ({ artifactContent, onRunStage, isRunning }: Stage1ResultProps): JSX.Element => {
    const [manualOverride, setManualOverride] = useState<string>("");
    const confidence = Number(artifactContent?.confidence ?? 0);
    const signatureResults = useMemo(() => {
        const raw = artifactContent?.signature_results;
        return Array.isArray(raw) ? raw : [];
    }, [artifactContent]);

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Source System Detection</CardTitle>
                    <CardDescription>Review the winning signature match before moving into enrichment.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-2">
                        <h3 className="text-2xl font-semibold">{String(artifactContent?.system ?? "No result yet")}</h3>
                        <div className="flex flex-wrap gap-2">
                            <Badge variant={confidenceVariant(confidence)}>{Math.round(confidence * 100)}% confidence</Badge>
                            {artifactContent?.version_hint ? <Badge variant="outline">{String(artifactContent.version_hint)}</Badge> : null}
                        </div>
                    </div>
                    <div className="w-full max-w-sm space-y-3">
                        <p className="text-sm font-medium">Manual override if confidence is low</p>
                        <Select value={manualOverride} onValueChange={setManualOverride}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a source system" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Practice Engine">Practice Engine</SelectItem>
                                <SelectItem value="QuickBooks">QuickBooks</SelectItem>
                                <SelectItem value="ProSystem fx">ProSystem fx</SelectItem>
                                <SelectItem value="Thomson Reuters Practice CS">Thomson Reuters Practice CS</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button onClick={() => onRunStage(2)} disabled={isRunning}>{isRunning ? "Starting..." : "Enrich Schema →"}</Button>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Signature Detail</CardTitle>
                </CardHeader>
                <CardContent>
                    <Collapsible defaultOpen>
                        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold">
                            <ChevronDown className="h-4 w-4" />
                            Matched signatures
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-4">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>System</TableHead>
                                        <TableHead>Version</TableHead>
                                        <TableHead>Confidence</TableHead>
                                        <TableHead>Matched Tables</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {signatureResults.map((result, index) => {
                                        const item = result as Record<string, unknown>;
                                        return (
                                            <TableRow key={`${String(item.system)}-${index}`}>
                                                <TableCell>{String(item.system ?? "Unknown")}</TableCell>
                                                <TableCell>{String(item.version_hint ?? "--")}</TableCell>
                                                <TableCell>{Math.round(Number(item.confidence ?? 0) * 100)}%</TableCell>
                                                <TableCell>{Array.isArray(item.matched_tables) ? item.matched_tables.join(", ") : "--"}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </CollapsibleContent>
                    </Collapsible>
                </CardContent>
            </Card>
        </div>
    );
};
