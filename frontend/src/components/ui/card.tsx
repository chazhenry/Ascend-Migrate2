import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * Elevation system:
 *
 *   Layer 0  bg-background  slate-50  / slate-950  — page canvas (darkest in dark mode)
 *   Layer 1  Card           white     / slate-900  — standard content containers
 *   Layer 2  ElevatedCard   white     / slate-800  — modals, popovers, floating panels
 *
 * Borders: slate-200 (light) / slate-800 (dark) on Layer 1
 *          slate-200 (light) / slate-700 (dark) on Layer 2
 */

// ─── Layer 1: Standard card ───────────────────────────────────────────────────

export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element => (
    <div
        className={cn(
            "rounded-lg border border-slate-200 bg-white shadow-panel",
            "dark:border-slate-800 dark:bg-slate-900",
            className,
        )}
        {...props}
    />
);

export const CardHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element => (
    <div className={cn("flex flex-col gap-1.5 p-5", className)} {...props} />
);

export const CardTitle = ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>): JSX.Element => (
    <h3
        className={cn("text-base font-semibold leading-none tracking-tight text-slate-900 dark:text-slate-50", className)}
        {...props}
    />
);

export const CardDescription = ({ className, ...props }: HTMLAttributes<HTMLParagraphElement>): JSX.Element => (
    <p className={cn("text-sm text-slate-500 dark:text-slate-400", className)} {...props} />
);

export const CardContent = ({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element => (
    <div className={cn("p-5 pt-0", className)} {...props} />
);

export const CardFooter = ({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element => (
    <div
        className={cn(
            "flex items-center p-5 pt-0",
            className,
        )}
        {...props}
    />
);

// ─── Layer 2: Elevated card (modals, floating panels) ─────────────────────────

export const ElevatedCard = ({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element => (
    <div
        className={cn(
            "rounded-lg border border-slate-200 bg-white shadow-elevated",
            "dark:border-slate-700 dark:bg-slate-800",
            className,
        )}
        {...props}
    />
);

// ─── Interactive card (clickable list items, selection tiles) ─────────────────

export const InteractiveCard = ({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element => (
    <div
        className={cn(
            "rounded-lg border border-slate-200 bg-white shadow-panel cursor-pointer",
            "transition-all duration-150",
            "hover:border-indigo-300 hover:shadow-elevated",
            "active:scale-[0.995] active:shadow-panel",
            "dark:border-slate-800 dark:bg-slate-900",
            "dark:hover:border-indigo-700 dark:hover:bg-slate-800",
            "dark:active:bg-slate-900",
            className,
        )}
        {...props}
    />
);
