import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            colors: {
                background: "hsl(var(--background) / <alpha-value>)",
                foreground: "hsl(var(--foreground) / <alpha-value>)",
                card: "hsl(var(--card) / <alpha-value>)",
                cardForeground: "hsl(var(--card-foreground) / <alpha-value>)",
                popover: "hsl(var(--popover) / <alpha-value>)",
                popoverForeground: "hsl(var(--popover-foreground) / <alpha-value>)",
                border: "hsl(var(--border) / <alpha-value>)",
                input: "hsl(var(--input) / <alpha-value>)",
                ring: "hsl(var(--ring) / <alpha-value>)",
                primary: "hsl(var(--primary) / <alpha-value>)",
                primaryForeground: "hsl(var(--primary-foreground) / <alpha-value>)",
                secondary: "hsl(var(--secondary) / <alpha-value>)",
                secondaryForeground: "hsl(var(--secondary-foreground) / <alpha-value>)",
                muted: "hsl(var(--muted) / <alpha-value>)",
                mutedForeground: "hsl(var(--muted-foreground) / <alpha-value>)",
                accent: "hsl(var(--accent) / <alpha-value>)",
                accentForeground: "hsl(var(--accent-foreground) / <alpha-value>)",
                destructive: "hsl(var(--destructive) / <alpha-value>)",
                destructiveForeground: "hsl(var(--destructive-foreground) / <alpha-value>)",
                success: "hsl(var(--success) / <alpha-value>)",
                warning: "hsl(var(--warning) / <alpha-value>)",
                info: "hsl(var(--info) / <alpha-value>)",
            },
            borderRadius: {
                xl: "0.75rem",
                lg: "0.5rem",
                md: "0.375rem",
                sm: "0.25rem",
            },
            boxShadow: {
                // Layer 1 — cards and sidebars
                panel: "0 1px 3px rgba(15, 23, 42, 0.07), 0 4px 12px rgba(15, 23, 42, 0.05)",
                // Layer 2 — modals, dropdowns, popovers
                elevated: "0 4px 6px rgba(15, 23, 42, 0.07), 0 12px 32px rgba(15, 23, 42, 0.12)",
            },
            fontFamily: {
                sans: ["'IBM Plex Sans'", "'Segoe UI'", "sans-serif"],
                mono: ["'IBM Plex Mono'", "monospace"],
            },
        },
    },
    plugins: [],
};

export default config;
