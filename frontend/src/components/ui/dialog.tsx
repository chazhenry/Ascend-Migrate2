import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogContent = ({ children, className }: { children: ReactNode; className?: string }): JSX.Element => (
    <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-900/50" />
        <DialogPrimitive.Content
            className={cn(
                "fixed left-1/2 top-1/2 z-50 h-[75vh] w-[75vw] max-w-none -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border border-border bg-card p-4 shadow-[0_18px_48px_rgba(15,23,42,0.18)]",
                className,
            )}
        >
            {children}
            <DialogPrimitive.Close className="absolute right-3 top-3 rounded-md p-1 text-mutedForeground transition hover:bg-muted">
                <X className="h-4 w-4" />
            </DialogPrimitive.Close>
        </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
);

export const DialogHeader = ({ children, className }: { children: ReactNode; className?: string }): JSX.Element => (
    <div className={cn("mb-4 space-y-1", className)}>{children}</div>
);
export const DialogTitle = ({ children, className }: { children: ReactNode; className?: string }): JSX.Element => (
    <DialogPrimitive.Title className={cn("text-xl font-semibold", className)}>{children}</DialogPrimitive.Title>
);
export const DialogDescription = ({ children, className }: { children: ReactNode; className?: string }): JSX.Element => (
    <DialogPrimitive.Description className={cn("text-sm text-mutedForeground", className)}>{children}</DialogPrimitive.Description>
);
