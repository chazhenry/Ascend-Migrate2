import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import type { ReactNode } from "react";

export const ScrollArea = ({ children, className }: { children: ReactNode; className?: string }): JSX.Element => (
    <ScrollAreaPrimitive.Root className={className}>
        <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">{children}</ScrollAreaPrimitive.Viewport>
        <ScrollAreaPrimitive.Scrollbar orientation="vertical" className="flex w-2 touch-none bg-transparent p-0.5">
            <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-border" />
        </ScrollAreaPrimitive.Scrollbar>
    </ScrollAreaPrimitive.Root>
);
