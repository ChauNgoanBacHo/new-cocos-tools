import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";

const electronMainExternals = [
    "electron-updater",
    "eslint",
    "typescript",
    "typescript-eslint",
    /^@oxc-resolver\//,
];

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        react(),
        electron({
            main: {
                entry: "electron/main.ts",
                vite: {
                    build: {
                        rollupOptions: {
                            external: electronMainExternals,
                        },
                    },
                },
            },
            preload: {
                input: "electron/preload.ts",
            },
        }),
    ],
});
