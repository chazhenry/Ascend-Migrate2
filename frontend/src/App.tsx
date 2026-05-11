import type { JSX } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { AcquisitionList } from "@/pages/AcquisitionList";
import { AcquisitionWorkspace } from "@/pages/AcquisitionWorkspace";
import { Home } from "@/pages/Home";
import { Login } from "@/pages/Login";
import { SchemaEnricher } from "@/pages/SchemaEnricher";

const ShellLayout = (): JSX.Element => (
    <AppShell>
        <Outlet />
    </AppShell>
);

export const App = (): JSX.Element => {
    return (
        <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/schema-enricher" element={<SchemaEnricher />} />
            <Route element={<ProtectedRoute />}>
                <Route element={<ShellLayout />}>
                    <Route path="/acquisitions" element={<AcquisitionList />} />
                    <Route path="/acquisitions/:id" element={<AcquisitionWorkspace />} />
                </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
};
