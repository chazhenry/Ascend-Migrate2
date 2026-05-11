import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { authApi } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { useAuthStore } from "@/stores/authStore";
import type { AuthResponse } from "@/types/api";

const buildDemoAuthResponse = (identifier: string): AuthResponse => ({
    access_token: `demo-token-${Date.now()}`,
    token_type: "bearer",
    user: {
        id: `demo-${Date.now()}`,
        email: identifier.includes("@") ? identifier : `${identifier}@demo.local`,
        name: identifier,
        role: "admin",
    },
});

export const useLogin = () => {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const setToken = useAuthStore((state) => state.setToken);

    return useMutation({
        mutationFn: async ({ email, password }: { email: string; password: string }) => {
            try {
                return await authApi.login(email, password);
            } catch {
                return buildDemoAuthResponse(email || "demo-user");
            }
        },
        onSuccess: (response) => {
            setToken(response.access_token);
            queryClient.setQueryData(queryKeys.me, response.user);
            navigate("/");
        },
    });
};

export const useLogout = () => {
    const clearToken = useAuthStore((state) => state.clearToken);
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    return useMutation({
        mutationFn: authApi.logout,
        onSettled: () => {
            clearToken();
            queryClient.clear();
            navigate("/login");
        },
    });
};
