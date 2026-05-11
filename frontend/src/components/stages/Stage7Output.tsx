import type { JSX } from "react";

import { Download, FileArchive, FileSpreadsheet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { artifactsApi } from "@/lib/api";
import type { Artifact } from "@/types/api";

interface Stage7OutputProps {
    acquisitionId: string;
    excelArtifact?: Artifact;
    flatFileArtifact?: Artifact;
    onRunStage: (stage: number) => void;
    isRunning: boolean;
}

export const Stage7Output = ({ acquisitionId, excelArtifact, flatFileArtifact, onRunStage, isRunning }: Stage7OutputProps): JSX.Element => {
    return (
        <div className="grid gap-6 lg:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-3"><FileSpreadsheet className="h-5 w-5 text-primary" /> CCH Excel Template</CardTitle>
                    <CardDescription>Workbook output aligned to entity sheets for the CCH conversion template.</CardDescription>
                </CardHeader>
                <CardContent>
                    {excelArtifact ? (
                        <a href={artifactsApi.downloadUrl(acquisitionId, excelArtifact.id)}>
                            <Button>
                                <Download className="h-4 w-4" />
                                Download Excel Output
                            </Button>
                        </a>
                    ) : (
                        <Button onClick={() => onRunStage(7)} disabled={isRunning}>{isRunning ? "Generating..." : "Generate"}</Button>
                    )}
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-3"><FileArchive className="h-5 w-5 text-primary" /> CCH Flat Files</CardTitle>
                    <CardDescription>Zipped CSV bundle for import-ready CCH flat-file delivery.</CardDescription>
                </CardHeader>
                <CardContent>
                    {flatFileArtifact ? (
                        <a href={artifactsApi.downloadUrl(acquisitionId, flatFileArtifact.id)}>
                            <Button>
                                <Download className="h-4 w-4" />
                                Download CSV Zip
                            </Button>
                        </a>
                    ) : (
                        <Button onClick={() => onRunStage(7)} disabled={isRunning}>{isRunning ? "Generating..." : "Generate"}</Button>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};
