import type { JSX, ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { DatabaseZap, FileCog, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useLogout } from "@/hooks/useAuth";

interface AppShellProps {
    children: ReactNode;
}

const navItems = [
    { to: "/acquisitions", label: "Acquisitions", icon: DatabaseZap },
    { to: "/schema-enricher", label: "Schema Enricher", icon: FileCog },
];

export const AppShell = ({ children }: AppShellProps): JSX.Element => {
    const logoutMutation = useLogout();

    return (
        <div className="min-h-screen bg-background px-4 py-4 md:px-5">
            <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-[1600px] gap-4 lg:gap-5">
                <aside className="hidden w-64 shrink-0 rounded-lg border border-border bg-card p-4 shadow-panel lg:flex lg:flex-col">
                    <Link to="/acquisitions" className="rounded-md border border-border bg-background p-4 text-primary">
                        <p className="text-xs font-semibold uppercase tracking-[0.35em]">PM</p>
                        <h2 className="mt-2 text-xl font-semibold text-foreground">Project Migrate</h2>
                        <p className="mt-2 text-sm text-mutedForeground">Seven-stage migration workspace for CCH Axcess conversion.</p>
                    </Link>
                    <nav className="mt-6 flex flex-1 flex-col gap-2">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            return (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    className={({ isActive }) =>
                                        [
                                            "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition",
                                            isActive ? "bg-foreground text-background" : "text-foreground hover:bg-muted",
                                        ].join(" ")
                                    }
                                >
                                    <Icon className="h-4 w-4" />
                                    {item.label}
                                </NavLink>
                            );
                        })}
                    </nav>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => logoutMutation.mutate()} className="flex-1 justify-start">
                            <LogOut className="h-4 w-4" />
                            Sign Out
                        </Button>
                        <ThemeToggle />
                    </div>
                </aside>
                <main className="flex-1 rounded-lg border border-border bg-card p-4 shadow-panel md:p-5 lg:p-6">
                    {children}
                </main>
            </div>
        </div>
    );
};
