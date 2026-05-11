import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
    theme: Theme;
    resolvedTheme: ResolvedTheme;
    setTheme: (theme: Theme) => void;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "project-migrate-theme";

function getSystemTheme(): ResolvedTheme {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolve(t: Theme): ResolvedTheme {
    return t === "system" ? getSystemTheme() : t;
}

function applyTheme(resolved: ResolvedTheme): void {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolved);
    root.style.colorScheme = resolved;
}

function readStored(): Theme {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        if (v === "light" || v === "dark" || v === "system") return v;
    } catch { /* localStorage blocked */ }
    return "system";
}

function writeStored(t: Theme): void {
    try {
        localStorage.setItem(STORAGE_KEY, t);
    } catch { /* localStorage blocked */ }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>(() => {
        const stored = readStored();
        // Apply synchronously before the first React render so there is
        // never a frame painted with the wrong theme, regardless of whether
        // the inline <head> script already ran.
        applyTheme(resolve(stored));
        return stored;
    });

    const resolvedTheme = resolve(theme);

    // Re-apply whenever the resolved value changes (user toggle, etc.)
    useEffect(() => {
        applyTheme(resolvedTheme);
    }, [resolvedTheme]);

    // Follow OS preference changes while in "system" mode
    useEffect(() => {
        if (theme !== "system") return;
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        const handler = (e: MediaQueryListEvent) => applyTheme(e.matches ? "dark" : "light");
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, [theme]);

    function setTheme(next: Theme): void {
        applyTheme(resolve(next));   // immediate — no waiting for useEffect
        setThemeState(next);
        writeStored(next);
    }

    // Cycles: light → dark → system → light
    function toggleTheme(): void {
        setTheme(theme === "light" ? "dark" : theme === "dark" ? "system" : "light");
    }

    return (
        <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme(): ThemeContextValue {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
    return ctx;
}
