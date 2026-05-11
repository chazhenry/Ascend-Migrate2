import type { JSX } from "react";
import { useCallback, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { FileUp, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getApiErrorMessage } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import type { AcquisitionFile } from "@/types/api";

interface Stage1UploadProps {
    files: AcquisitionFile[];
    onUpload: (files: File[]) => Promise<unknown>;
    onRunStage: (stage: number) => void;
    isUploading: boolean;
    isRunning: boolean;
}

export const Stage1Upload = ({ files, onUpload, onRunStage, isUploading, isRunning }: Stage1UploadProps): JSX.Element => {
    const [error, setError] = useState<string | null>(null);
    const [queuedFiles, setQueuedFiles] = useState<File[]>([]);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        setQueuedFiles((current) => [...current, ...acceptedFiles]);
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            "application/json": [".json"],
            "text/csv": [".csv"],
            "application/sql": [".sql"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
        },
    });

    const hasSchemaJson = useMemo(() => files.some((file) => file.file_type === "schema_json") || queuedFiles.some((file) => file.name.endsWith(".json")), [files, queuedFiles]);

    const handleUpload = async (): Promise<void> => {
        if (queuedFiles.length === 0) {
            return;
        }
        try {
            setError(null);
            await onUpload(queuedFiles);
            setQueuedFiles([]);
        } catch (uploadError) {
            setError(getApiErrorMessage(uploadError));
        }
    };

    return (
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <Card>
                <CardHeader>
                    <CardTitle>Stage 1 Upload</CardTitle>
                    <CardDescription>Drop source schema and export files. Detection requires at least one schema JSON file.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div
                        {...getRootProps()}
                        className={[
                            "rounded-[1.5rem] border border-dashed p-8 text-center transition",
                            isDragActive ? "border-primary bg-primary/5" : "border-border bg-background/60",
                        ].join(" ")}
                    >
                        <input {...getInputProps()} />
                        <FileUp className="mx-auto h-10 w-10 text-primary" />
                        <p className="mt-4 text-lg font-semibold">Drag source files here</p>
                        <p className="mt-2 text-sm text-mutedForeground">Accepts JSON, CSV, SQL, and XLSX.</p>
                    </div>
                    {queuedFiles.length > 0 ? (
                        <div className="space-y-3 rounded-2xl border border-border bg-background/60 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold">Queued files</p>
                                <Button variant="ghost" size="sm" onClick={() => setQueuedFiles([])}>
                                    <Trash2 className="h-4 w-4" />
                                    Clear
                                </Button>
                            </div>
                            <div className="space-y-2">
                                {queuedFiles.map((file) => (
                                    <div key={`${file.name}-${file.size}`} className="flex items-center justify-between rounded-xl bg-card px-3 py-2 text-sm">
                                        <span>{file.name}</span>
                                        <span className="text-mutedForeground">{formatBytes(file.size)}</span>
                                    </div>
                                ))}
                            </div>
                            <Button onClick={handleUpload} disabled={isUploading}>{isUploading ? "Uploading..." : "Upload files"}</Button>
                        </div>
                    ) : null}
                    {error ? <Alert variant="destructive">{error}</Alert> : null}
                    <Button onClick={() => onRunStage(1)} disabled={!hasSchemaJson || isRunning} size="lg">
                        {isRunning ? "Detecting..." : "Detect Source System →"}
                    </Button>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Uploaded Files</CardTitle>
                    <CardDescription>Server-side file inventory and row-count metadata.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Filename</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Rows</TableHead>
                                <TableHead>Size</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {files.map((file) => (
                                <TableRow key={file.id}>
                                    <TableCell className="font-medium">{file.filename}</TableCell>
                                    <TableCell>{file.file_type}</TableCell>
                                    <TableCell>{file.row_count ?? "--"}</TableCell>
                                    <TableCell>{formatBytes(file.file_size_bytes)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    {files.length === 0 ? <p className="mt-4 text-sm text-mutedForeground">No files uploaded yet.</p> : null}
                </CardContent>
            </Card>
        </div>
    );
};
