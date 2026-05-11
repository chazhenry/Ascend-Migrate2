import type { JSX } from "react";
import { useMemo } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { DiscoveryAnswer } from "@/types/api";

interface Stage3DiscoveryProps {
    answers: DiscoveryAnswer[];
    historicalYears: number;
    onHistoricalYearsChange: (value: number) => void;
    onUpdateAnswer: (questionKey: string, answer: string) => void;
    onRunStage: (stage: number) => void;
    isRunning: boolean;
}

const groupOrder = ["historical_scope", "staff_crosswalk", "billing", "client_identity", "data_quality", "entity_type"];

const crosswalkRows = [
    { source: "Source Value A", destination: "" },
    { source: "Source Value B", destination: "" },
];

export const Stage3Discovery = ({
    answers,
    historicalYears,
    onHistoricalYearsChange,
    onUpdateAnswer,
    onRunStage,
    isRunning,
}: Stage3DiscoveryProps): JSX.Element => {
    const grouped = useMemo(() => {
        const groups = new Map<string, DiscoveryAnswer[]>();
        answers.forEach((answer) => {
            const category = answer.question_key.includes("billing")
                ? "billing"
                : answer.question_key.includes("staff")
                    ? "staff_crosswalk"
                    : answer.question_key.includes("historical")
                        ? "historical_scope"
                        : answer.question_key.includes("entity")
                            ? "entity_type"
                            : "data_quality";
            groups.set(category, [...(groups.get(category) ?? []), answer]);
        });
        return groupOrder
            .map((key) => ({ key, items: groups.get(key) ?? [] }))
            .filter((group) => group.items.length > 0);
    }, [answers]);

    const requiredCount = answers.filter((answer) => answer.is_required).length;
    const answeredCount = answers.filter((answer) => !answer.is_required || Boolean(answer.answer?.trim())).length;
    const progress = requiredCount === 0 ? 0 : Math.round((answeredCount / requiredCount) * 100);
    const allRequiredAnswered = answers.every((answer) => !answer.is_required || Boolean(answer.answer?.trim()));

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Discovery Questions</CardTitle>
                    <CardDescription>Answer only the migration decisions that genuinely block field mapping.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                    <div className="space-y-3 rounded-2xl border border-border bg-background/60 p-4">
                        <p className="text-sm font-semibold">Historical Years</p>
                        <div className="flex items-center gap-3">
                            <Button variant="outline" size="sm" onClick={() => onHistoricalYearsChange(Math.max(1, historicalYears - 1))}>-</Button>
                            <span className="text-2xl font-semibold">{historicalYears}</span>
                            <Button variant="outline" size="sm" onClick={() => onHistoricalYearsChange(historicalYears + 1)}>+</Button>
                        </div>
                        <p className="text-sm text-mutedForeground">Used by SQL generation to apply the date filter window.</p>
                    </div>
                    <div className="space-y-3 rounded-2xl border border-border bg-background/60 p-4">
                        <div className="flex items-center justify-between text-sm font-medium">
                            <span>Required answers complete</span>
                            <span>{answeredCount} of {requiredCount}</span>
                        </div>
                        <Progress value={progress} />
                    </div>
                </CardContent>
            </Card>
            {grouped.map((group) => (
                <Card key={group.key}>
                    <CardHeader>
                        <CardTitle>{group.key.replace(/_/g, " ")}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {group.items.map((answer) => (
                            <div key={answer.id} className="rounded-2xl border border-border bg-background/60 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="font-semibold">{answer.question_text}</p>
                                        <p className="mt-1 text-sm text-mutedForeground">Key: {answer.question_key}</p>
                                    </div>
                                </div>
                                <Collapsible>
                                    <CollapsibleTrigger className="mt-3 flex items-center gap-2 text-sm font-medium text-primary">
                                        <ChevronDown className="h-4 w-4" />
                                        Why this blocks mapping
                                    </CollapsibleTrigger>
                                    <CollapsibleContent className="pt-2 text-sm text-mutedForeground">{answer.why_blocking}</CollapsibleContent>
                                </Collapsible>
                                <div className="mt-4">
                                    {answer.question_key.includes("crosswalk") ? (
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Source</TableHead>
                                                    <TableHead>Destination</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {crosswalkRows.map((row) => (
                                                    <TableRow key={row.source}>
                                                        <TableCell>{row.source}</TableCell>
                                                        <TableCell>
                                                            <Input
                                                                defaultValue={answer.answer ?? ""}
                                                                onBlur={(event) => onUpdateAnswer(answer.question_key, event.target.value)}
                                                                placeholder="Destination value"
                                                            />
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    ) : answer.question_key.includes("historical") ? (
                                        <Select value={answer.answer ?? ""} onValueChange={(value) => onUpdateAnswer(answer.question_key, value)}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a value" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="1">1 year</SelectItem>
                                                <SelectItem value="3">3 years</SelectItem>
                                                <SelectItem value="5">5 years</SelectItem>
                                                <SelectItem value="7">7 years</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    ) : answer.question_key.includes("select") ? (
                                        <Select value={answer.answer ?? ""} onValueChange={(value) => onUpdateAnswer(answer.question_key, value)}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a value" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Yes">Yes</SelectItem>
                                                <SelectItem value="No">No</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <Textarea defaultValue={answer.answer ?? ""} onBlur={(event) => onUpdateAnswer(answer.question_key, event.target.value)} />
                                    )}
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            ))}
            <Button onClick={() => onRunStage(4)} disabled={!allRequiredAnswered || isRunning} size="lg">
                {isRunning ? "Generating..." : "Generate Mapping Manifest →"}
            </Button>
        </div>
    );
};
