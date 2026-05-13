import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { fileURLToPath } from "url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": resolve(rootDir, "src"),
        },
    },
    server: {
        host: "localhost",
        port: 5180,
        proxy: {
            "/api": {
                target: "http://localhost:8001",
                changeOrigin: true,
            },
        },
    },
});
