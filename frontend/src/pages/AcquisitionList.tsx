import type { JSX } from "react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type ColumnDef } from "@tanstack/react-table";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAcquisitions, useArchiveAcquisition, useCreateAcquisition } from "@/hooks/useAcquisitions";
import { getApiErrorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import type { AcquisitionListItem } from "@/types/api";

const acquisitionSchema = z.object({
    name: z.string().min(1),
    historical_years: z.coerce.number().int().min(1).max(20),
    source_db_host: z.string().optional(),
    source_db_port: z.coerce.number().int().min(1).max(65535).optional(),
    source_db_name: z.string().optional(),
    source_db_schema: z.string().optional(),
    source_db_user: z.string().optional(),
    source_db_password: z.string().optional(),
});

type AcquisitionFormValues = z.infer<typeof acquisitionSchema>;

const statusVariant = (status: string): "info" | "warning" | "success" | "destructive" | "outline" => {
    if (status === "running" || status === "idle") {
        return "info";
    }
    if (status === "awaiting_review") {
        return "warning";
    }
    if (status === "complete") {
        return "success";
    }
    if (status === "blocked") {
        return "destructive";
    }
    return "outline";
};

export const AcquisitionList = (): JSX.Element => {
    const navigate = useNavigate();
    const [dialogOpen, setDialogOpen] = useState(false);
    const acquisitionsQuery = useAcquisitions();
    const createMutation = useCreateAcquisition();
    const archiveMutation = useArchiveAcquisition();
    const { register, handleSubmit, reset } = useForm<AcquisitionFormValues>({
        resolver: zodResolver(acquisitionSchema),
        defaultValues: { historical_years: 3 },
    });

    const columns = useMemo<Array<ColumnDef<AcquisitionListItem>>>(
        () => [
            { accessorKey: "name", header: "Firm Name" },
            { accessorKey: "source_system", header: "Source System", cell: ({ row }) => row.original.source_system ?? "Pending" },
            { accessorKey: "current_stage", header: "Stage", cell: ({ row }) => `Stage ${row.original.current_stage}` },
            {
                accessorKey: "stage_status",
                header: "Status",
                cell: ({ row }) => <Badge variant={statusVariant(row.original.stage_status)}>{row.original.stage_status.replace(/_/g, " ")}</Badge>,
            },
            { accessorKey: "updated_at", header: "Last Updated", cell: ({ row }) => formatDateTime(row.original.updated_at) },
            {
                id: "actions",
                header: "Actions",
                cell: ({ row }) => (
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => navigate(`/acquisitions/${row.original.id}`)}>Open</Button>
                        <Button size="sm" variant="outline" onClick={() => archiveMutation.mutate(row.original.id)}>Archive</Button>
                    </div>
                ),
            },
        ],
        [archiveMutation, navigate],
    );

    return (
        <div className="space-y-8">
            <PageHeader
                title="Acquisitions"
                description="Track each acquired firm through source detection, enrichment, review gates, and final CCH output generation."
                actions={
                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                        <DialogTrigger asChild>
                            <Button>New Acquisition</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Create Acquisition</DialogTitle>
                                <DialogDescription>Save source DB connection details and open a new migration workspace.</DialogDescription>
                            </DialogHeader>
                            <form
                                className="grid gap-4 md:grid-cols-2"
                                onSubmit={handleSubmit(async (values) => {
                                    const acquisition = await createMutation.mutateAsync(values);
                                    reset();
                                    setDialogOpen(false);
                                    navigate(`/acquisitions/${acquisition.id}`);
                                })}
                            >
                                <div className="space-y-2 md:col-span-2">
                                    <Label htmlFor="name">Firm Name</Label>
                                    <Input id="name" {...register("name")} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="historical_years">Historical Years</Label>
                                    <Input id="historical_years" type="number" {...register("historical_years")} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="source_db_host">Host</Label>
                                    <Input id="source_db_host" {...register("source_db_host")} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="source_db_port">Port</Label>
                                    <Input id="source_db_port" type="number" {...register("source_db_port")} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="source_db_name">DB Name</Label>
                                    <Input id="source_db_name" {...register("source_db_name")} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="source_db_schema">Schema</Label>
                                    <Input id="source_db_schema" {...register("source_db_schema")} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="source_db_user">User</Label>
                                    <Input id="source_db_user" {...register("source_db_user")} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="source_db_password">Password</Label>
                                    <Input id="source_db_password" type="password" {...register("source_db_password")} />
                                </div>
                                {createMutation.error ? <Alert variant="destructive" className="md:col-span-2">{getApiErrorMessage(createMutation.error)}</Alert> : null}
                                <div className="md:col-span-2 flex justify-end">
                                    <Button type="submit">{createMutation.isPending ? "Creating..." : "Save Acquisition"}</Button>
                                </div>
                            </form>
                        </DialogContent>
                    </Dialog>
                }
            />
            {acquisitionsQuery.error ? <Alert variant="destructive">{getApiErrorMessage(acquisitionsQuery.error)}</Alert> : null}
            <div className="rounded-[1.5rem] border border-border bg-background/60 p-3">
                <DataTable columns={columns} data={acquisitionsQuery.data ?? []} />
            </div>
        </div>
    );
};
