import type { JSX } from "react";
import { Navigate, Outlet } from "react-router-dom";

import { useAuthStore } from "@/stores/authStore";

export const ProtectedRoute = (): JSX.Element => {
    const token = useAuthStore((state) => state.token);
    if (!token) {
        return <Navigate to="/login" replace />;
    }
    return <Outlet />;
};
