import * as React from "react";

import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
    { className, ...props },
    ref,
) {
    return (
        <input
            className={cn(
                "flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                className,
            )}
            ref={ref}
            {...props}
        />
    );
});
