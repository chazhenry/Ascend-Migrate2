import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
    variant?: "default" | "destructive";
}

export const Alert = ({ className, variant = "default", ...props }: AlertProps): JSX.Element => (
    <div
        className={cn(
            "rounded-2xl border px-4 py-3 text-sm",
            variant === "destructive"
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : "border-border bg-card text-cardForeground",
            className,
        )}
        role="alert"
        {...props}
    />
);
