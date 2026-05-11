import type { JSX } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ValidationEntity {
    entity: string;
    row_count: number;
    pass_count: number;
    warn_count: number;
    fail_count: number;
    failures: Array<Record<string, unknown>>;
}

interface ValidationFailure {
    key: string;
    entity: string;
    row_identifier: number | string;
    field: string;
    constraint: string;
    actual_value?: unknown;
}

interface Stage6ValidationProps {
    report: Record<string, unknown> | null;
    onRunStage: (stage: number) => void;
    onJumpToManifest: () => void;
    isRunning: boolean;
}

export const Stage6Validation = ({ report, onRunStage, onJumpToManifest, isRunning }: Stage6ValidationProps): JSX.Element => {
    const entities = (report?.entities as ValidationEntity[] | undefined) ?? [];
    const allResolved = entities.every((entity) => entity.fail_count === 0);
    const failures: ValidationFailure[] = entities.flatMap((entity) =>
        entity.failures.map((failure, index) => ({
            key: `${entity.entity}-${index}`,
            entity: entity.entity,
            row_identifier: Number(failure.row_identifier ?? index + 1),
            field: String(failure.field ?? "unknown_field"),
            constraint: String(failure.constraint ?? "unknown_constraint"),
            actual_value: failure.actual_value,
        })),
    );

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Human Gate 2 · Validation</CardTitle>
                    <CardDescription>Review entity-level outcomes and resolve or accept failures before output generation.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Entity</TableHead>
                                <TableHead>Rows</TableHead>
                                <TableHead>Pass</TableHead>
                                <TableHead>Warn</TableHead>
                                <TableHead>Fail</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {entities.map((entity) => (
                                <TableRow key={entity.entity}>
                                    <TableCell className="font-medium">{entity.entity}</TableCell>
                                    <TableCell>{entity.row_count}</TableCell>
                                    <TableCell>{entity.pass_count}</TableCell>
                                    <TableCell>{entity.warn_count}</TableCell>
                                    <TableCell>{entity.fail_count}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <div className="space-y-4">
                        {failures.map((failure) => (
                            <div key={failure.key} className="rounded-2xl border border-destructive/25 bg-destructive/10 p-4 text-sm">
                                <p className="font-semibold">{failure.entity} · Row {String(failure.row_identifier)}</p>
                                <p className="mt-1">Field {String(failure.field)} violated {String(failure.constraint)} with value {String(failure.actual_value ?? "<null>")}</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <Button size="sm" variant="outline" onClick={onJumpToManifest}>Fix in Manifest</Button>
                                    <Button size="sm" variant="outline">Apply Default</Button>
                                    <Button size="sm" variant="destructive">Drop Rows</Button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <Button onClick={() => onRunStage(7)} disabled={!allResolved || isRunning} size="lg">
                        {isRunning ? "Generating..." : "Proceed to Output →"}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
};
