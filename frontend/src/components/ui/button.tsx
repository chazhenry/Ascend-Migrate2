import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
    [
        // Base
        "inline-flex items-center justify-center gap-2 rounded-md text-sm font-semibold select-none",
        // Transition
        "transition-all duration-150 ease-in-out",
        // Subtle press scale on active
        "active:scale-[0.975]",
        // Focus ring — offset matches the layer the button sits on
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
        "focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900",
        // Disabled
        "disabled:pointer-events-none disabled:opacity-40",
    ].join(" "),
    {
        variants: {
            variant: {
                /**
                 * Primary — indigo-600
                 * Light: hover → indigo-700 (deepen), active → indigo-800
                 * Dark:  hover → indigo-500 (brighten/glow), active → indigo-700 (deepen press)
                 */
                default: [
                    "bg-indigo-600 text-white shadow-sm",
                    "hover:bg-indigo-700 active:bg-indigo-800",
                    "dark:hover:bg-indigo-500 dark:active:bg-indigo-700",
                ].join(" "),

                /**
                 * Secondary — slate neutral
                 * Light: slate-100 base, slate-200 hover, slate-300 active
                 * Dark:  slate-800 base, slate-700 hover, slate-600 active
                 */
                secondary: [
                    "bg-slate-100 text-slate-700 shadow-sm",
                    "hover:bg-slate-200 active:bg-slate-300",
                    "dark:bg-slate-800 dark:text-slate-200",
                    "dark:hover:bg-slate-700 dark:active:bg-slate-600",
                ].join(" "),

                /**
                 * Outline — bordered, transparent fill
                 * Light: white bg, slate-200 border → slate-50 hover
                 * Dark:  slate-900 bg, slate-700 border → slate-800 hover
                 */
                outline: [
                    "border border-slate-200 bg-white text-slate-700 shadow-sm",
                    "hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100",
                    "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
                    "dark:hover:bg-slate-800 dark:hover:border-slate-600 dark:active:bg-slate-700",
                ].join(" "),

                /**
                 * Ghost — no background until hovered
                 * Light: transparent → slate-100 hover
                 * Dark:  transparent → slate-800 hover
                 */
                ghost: [
                    "text-slate-700",
                    "hover:bg-slate-100 active:bg-slate-200",
                    "dark:text-slate-300",
                    "dark:hover:bg-slate-800 dark:active:bg-slate-700",
                ].join(" "),

                /**
                 * Destructive — red-600
                 * Same shade logic as primary
                 */
                destructive: [
                    "bg-red-600 text-white shadow-sm",
                    "hover:bg-red-700 active:bg-red-800",
                    "dark:hover:bg-red-500 dark:active:bg-red-700",
                ].join(" "),

                aero: [
                    "border border-sky-200/80 text-sky-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_10px_24px_rgba(56,189,248,0.24)]",
                    "bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(224,242,254,0.94)_48%,rgba(125,211,252,0.92)_100%)] backdrop-blur-md",
                    "hover:border-sky-300 hover:brightness-[1.03] active:brightness-95",
                    "dark:border-sky-400/40 dark:text-sky-50 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_28px_rgba(14,165,233,0.22)]",
                    "dark:bg-[linear-gradient(180deg,rgba(14,165,233,0.28)_0%,rgba(14,116,144,0.5)_45%,rgba(8,47,73,0.94)_100%)]",
                    "dark:hover:border-sky-300/60 dark:hover:brightness-110 dark:active:brightness-95",
                ].join(" "),
            },
            size: {
                default: "h-10 px-3.5 py-2",
                sm: "h-8 px-3 text-xs",
                lg: "h-11 px-5 text-base",
                icon: "h-10 w-10",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    },
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof buttonVariants> {
    asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    { className, variant, size, asChild = false, ...props },
    ref,
) {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
