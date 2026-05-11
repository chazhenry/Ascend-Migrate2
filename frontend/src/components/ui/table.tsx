import type { HTMLAttributes, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const Table = ({ className, ...props }: TableHTMLAttributes<HTMLTableElement>): JSX.Element => (
    <div className="w-full overflow-x-auto">
        <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
);

export const TableHeader = ({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>): JSX.Element => (
    <thead className={cn("[&_tr]:border-b", className)} {...props} />
);

export const TableBody = ({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>): JSX.Element => (
    <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />
);

export const TableRow = ({ className, ...props }: HTMLAttributes<HTMLTableRowElement>): JSX.Element => (
    <tr className={cn("border-b border-border/80 transition-colors hover:bg-muted/50", className)} {...props} />
);

export const TableHead = ({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>): JSX.Element => (
    <th className={cn("h-12 px-4 text-left align-middle text-xs font-semibold uppercase tracking-[0.2em] text-mutedForeground", className)} {...props} />
);

export const TableCell = ({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>): JSX.Element => (
    <td className={cn("p-4 align-middle", className)} {...props} />
);
