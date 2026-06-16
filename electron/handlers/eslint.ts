import { ipcMain } from "electron";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";

export function registerEslintHandler() {
    ipcMain.handle("run-eslint", async (_event, sourcePath: string) => {
        try {
            const eslint = new ESLint({
                cwd: sourcePath,
                overrideConfigFile: true,
                overrideConfig: [
                    {
                        files: ["**/*.{js,jsx}"],
                        languageOptions: {
                            ecmaVersion: 2020,
                            sourceType: "module",
                            globals: {
                                window: "readonly",
                                chrome: "readonly",
                                console: "readonly",
                                eno: "readonly",
                                document: "readonly",
                                CC_PREVIEW: "readonly",
                            },
                        },
                        rules: {
                            "no-unused-vars": "error",
                            "no-undef": "error",
                            "no-console": "warn",
                            curly: "error",
                        },
                    },
                    {
                        files: ["**/*.{ts,tsx}"],
                        languageOptions: {
                            ecmaVersion: 2020,
                            sourceType: "module",
                            parser: tseslint.parser,
                            parserOptions: {
                                experimentalDecorators: true,
                            },
                            globals: {
                                window: "readonly",
                                chrome: "readonly",
                                console: "readonly",
                                eno: "readonly",
                                document: "readonly",
                                CC_PREVIEW: "readonly",
                            },
                        },
                        plugins: {
                            "@typescript-eslint": tseslint.plugin,
                        },
                        rules: {
                            "no-unused-vars": "off",
                            "no-undef": "error",
                            "no-console": "warn",
                            curly: "error",
                            "@typescript-eslint/explicit-function-return-type": "error",
                        },
                    },
                ],
            });

            const results = await eslint.lintFiles(".");

            const lines: string[] = [];
            for (const result of results) {
                if (result.messages.length === 0) continue;
                const filePath = result.filePath.replace(sourcePath + "/", "");
                for (const msg of result.messages) {
                    lines.push(`${filePath}:${msg.line}:${msg.column}  ${msg.severity === 2 ? "error" : "warning"}  ${msg.message}  ${msg.ruleId || ""}`);
                }
            }
            const output = lines.join("\n");

            const errorCount = results.reduce((sum, r) => sum + r.errorCount, 0);
            const warningCount = results.reduce((sum, r) => sum + r.warningCount, 0);

            return {
                stdout: output || `No issues found (${results.length} files scanned)`,
                stderr: "",
                exitCode: errorCount > 0 ? 1 : 0,
                errorCount,
                warningCount,
            };
        } catch (error: unknown) {
            return {
                stdout: "",
                stderr: error instanceof Error ? error.message : "Unknown ESLint error",
                exitCode: 2,
                errorCount: 0,
                warningCount: 0,
            };
        }
    });
}
