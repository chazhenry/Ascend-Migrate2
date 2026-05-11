import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold", {
    variants: {
        variant: {
            default: "bg-secondary text-secondaryForeground",
            success: "bg-success/15 text-success",
            warning: "bg-warning/18 text-amber-700",
            destructive: "bg-destructive/15 text-destructive",
            info: "bg-info/12 text-info",
            outline: "border border-border bg-transparent text-foreground",
        },
    },
    defaultVariants: {
        variant: "default",
    },
});

interface BadgeProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> { }

export const Badge = ({ className, variant, ...props }: BadgeProps): JSX.Element => (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
);
