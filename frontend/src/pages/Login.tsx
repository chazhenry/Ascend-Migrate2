import type { JSX } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin } from "@/hooks/useAuth";
import { getApiErrorMessage } from "@/lib/api";

const loginSchema = z.object({
    email: z.string().min(1, "Enter any username or email."),
    password: z.string().min(1),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export const Login = (): JSX.Element => {
    const loginMutation = useLogin();
    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<LoginFormValues>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            email: "admin@example.com",
            password: "ChangeMe123!",
        },
    });

    return (
        <div className="flex min-h-screen items-center justify-center px-4 py-12">
            <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-lg border border-border bg-card p-6 shadow-panel">
                    <p className="text-xs font-semibold uppercase tracking-[0.4em] text-primary">Project Migrate</p>
                    <h1 className="mt-4 text-4xl font-semibold leading-tight">Stateful migration delivery for acquired accounting firms.</h1>
                    <p className="mt-4 max-w-xl text-base leading-7 text-mutedForeground">
                        Upload source system evidence, enrich schemas, capture firm-specific decisions, review mappings, and generate CCH Axcess deliverables through a seven-stage workspace.
                    </p>
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle>Sign In</CardTitle>
                        <CardDescription>JWT tokens stay in memory only. Demo mode accepts any non-empty credentials while the database is offline.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form className="space-y-4" onSubmit={handleSubmit((values) => loginMutation.mutate(values))}>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email or Username</Label>
                                <Input id="email" {...register("email")} />
                                {errors.email ? <Alert variant="destructive">{errors.email.message}</Alert> : null}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password">Password</Label>
                                <Input id="password" type="password" {...register("password")} />
                                {errors.password ? <Alert variant="destructive">{errors.password.message}</Alert> : null}
                            </div>
                            {loginMutation.error ? <Alert variant="destructive">{getApiErrorMessage(loginMutation.error)}</Alert> : null}
                            <Button type="submit" className="w-full" size="lg">{loginMutation.isPending ? "Signing in..." : "Login"}</Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};
