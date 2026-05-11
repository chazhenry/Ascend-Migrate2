import type { JSX, ReactNode } from "react";

interface PageHeaderProps {
    title: string;
    description: string;
    actions?: ReactNode;
}

export const PageHeader = ({ title, description, actions }: PageHeaderProps): JSX.Element => {
    return (
        <div className="flex flex-col gap-4 border-b border-border/80 pb-6 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-primary">Project Migrate</p>
                <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
                <p className="max-w-2xl text-sm leading-6 text-mutedForeground md:text-base">{description}</p>
            </div>
            {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
    );
};
