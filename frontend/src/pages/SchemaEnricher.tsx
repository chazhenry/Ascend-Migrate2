import type { JSX } from "react";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { filesApi, getApiErrorMessage } from "@/lib/api";

export const SchemaEnricher = (): JSX.Element => {
    const [file, setFile] = useState<File | null>(null);
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleEnrich = async (): Promise<void> => {
        if (!file) {
            return;
        }
        try {
            setIsLoading(true);
            setError(null);
            const blob = await filesApi.enrichSchema(file);
            const url = URL.createObjectURL(blob);
            setDownloadUrl(url);
        } catch (requestError) {
            setError(getApiErrorMessage(requestError));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="mx-auto max-w-4xl px-4 py-10">
            <Card>
                <CardHeader>
                    <CardTitle>Schema Enricher</CardTitle>
                    <CardDescription>Public utility for enriching raw source schema JSON files without creating an acquisition.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <label className="flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-border bg-background/60 text-center">
                        <span className="text-lg font-semibold">Choose a schema JSON file</span>
                        <span className="mt-2 text-sm text-mutedForeground">Upload a raw information-schema extract and receive enriched JSON.</span>
                        <input type="file" accept=".json,application/json" className="hidden" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
                    </label>
                    {file ? <p className="text-sm font-medium">Selected file: {file.name}</p> : null}
                    {error ? <Alert variant="destructive">{error}</Alert> : null}
                    <div className="flex flex-wrap gap-3">
                        <Button onClick={handleEnrich} disabled={!file || isLoading}>{isLoading ? "Enriching..." : "Enrich →"}</Button>
                        {downloadUrl ? <a href={downloadUrl} download={`${file?.name ?? "schema"}-enriched.json`}><Button variant="outline">Download Result</Button></a> : null}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
