import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = ({ children, className }: { children: ReactNode; className?: string }): JSX.Element => (
    <SelectPrimitive.Trigger
        className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary",
            className,
        )}
    >
        {children}
        <SelectPrimitive.Icon>
            <ChevronDown className="h-4 w-4 text-mutedForeground" />
        </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
);

export const SelectContent = ({ children }: { children: ReactNode }): JSX.Element => (
    <SelectPrimitive.Portal>
        <SelectPrimitive.Content className="z-50 overflow-hidden rounded-md border border-border bg-card shadow-panel">
            <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
);

export const SelectItem = ({ children, value }: { children: ReactNode; value: string }): JSX.Element => (
    <SelectPrimitive.Item
        value={value}
        className="relative flex cursor-default select-none items-center rounded-md py-2 pl-8 pr-3 text-sm outline-none data-[highlighted]:bg-muted"
    >
        <SelectPrimitive.ItemIndicator className="absolute left-2 inline-flex items-center">
            <Check className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
);
