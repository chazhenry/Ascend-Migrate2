import { useEffect, useState } from "react";

import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";

const buildSseUrl = (jobId: string, token: string | null): string => {
    const baseUrl = apiClient.defaults.baseURL ?? "http://localhost:8000/api/v1";
    const url = new URL(`${baseUrl}/jobs/${jobId}/log`);
    if (token) {
        url.searchParams.set("token", token);
    }
    return url.toString();
};

export const useJobLogStream = (jobId?: string | null, enabled = true) => {
    const token = useAuthStore((state) => state.token);
    const [lines, setLines] = useState<string[]>([]);
    const [status, setStatus] = useState<"idle" | "streaming" | "done" | "error">("idle");

    useEffect(() => {
        if (!jobId || !enabled) {
            return undefined;
        }

        const source = new EventSource(buildSseUrl(jobId, token));
        setLines([]);
        setStatus("streaming");

        source.onmessage = (event) => {
            setLines((current) => [...current, event.data]);
        };

        source.addEventListener("done", (event) => {
            const doneEvent = event as MessageEvent<string>;
            setStatus(doneEvent.data === "failed" ? "error" : "done");
            source.close();
        });

        source.onerror = () => {
            setStatus((current) => (current === "done" ? current : "error"));
            source.close();
        };

        return () => {
            source.close();
        };
    }, [enabled, jobId, token]);

    return { lines, status };
};
