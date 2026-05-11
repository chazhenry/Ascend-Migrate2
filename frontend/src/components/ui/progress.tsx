import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

interface ProgressProps {
    value: number;
    className?: string;
}

export const Progress = ({ value, className }: ProgressProps): JSX.Element => (
    <ProgressPrimitive.Root className={cn("relative h-3 w-full overflow-hidden rounded-full bg-muted", className)} value={value}>
        <ProgressPrimitive.Indicator
            className="h-full bg-primary transition-transform"
            style={{ transform: `translateX(-${100 - Math.max(0, Math.min(100, value))}%)` }}
        />
    </ProgressPrimitive.Root>
);
