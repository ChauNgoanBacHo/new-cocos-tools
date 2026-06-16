import { ipcMain } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { main as runKnipMain } from "knip";
import { createOptions as createKnipOptions } from "knip/session";

type CodeHealthMode = "full" | "eslint" | "knip";
type CodeHealthSource = "eslint" | "knip";
type CodeHealthSeverity = "error" | "warning";

const HEALTH_SCORE_MAX = 100;
const HEALTH_WEIGHT_CRITICAL = 12;
const HEALTH_WEIGHT_MINOR = 4;

interface CodeHealthIssue {
    source: CodeHealthSource;
    severity: CodeHealthSeverity;
    location: {
        line: number | null;
        column: number | null;
        label: string;
    };
    message: string;
    ruleId: string;
}

interface CodeHealthFileReport {
    filePath: string;
    absolutePath: string;
    errorCount: number;
    warningCount: number;
    issues: CodeHealthIssue[];
}

interface EslintScanResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    errorCount: number;
    warningCount: number;
    files: CodeHealthFileReport[];
}

interface KnipScanResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    orphanFiles: number;
    unusedExports: number;
    files: CodeHealthFileReport[];
}

function findNearestTsconfig(sourcePath: string) {
    let currentPath = path.resolve(sourcePath);

    while (true) {
        const tsconfigPath = path.join(currentPath, "tsconfig.json");
        if (fs.existsSync(tsconfigPath)) {
            return tsconfigPath;
        }

        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) {
            return null;
        }

        currentPath = parentPath;
    }
}

function createEmptyEslintResult(): EslintScanResult {
    return {
        stdout: "ESLint scan skipped",
        stderr: "",
        exitCode: 0,
        errorCount: 0,
        warningCount: 0,
        files: [],
    };
}

function createEmptyKnipResult(): KnipScanResult {
    return {
        stdout: "Knip scan skipped",
        stderr: "",
        exitCode: 0,
        orphanFiles: 0,
        unusedExports: 0,
        files: [],
    };
}

export async function runEslintScan(sourcePath: string): Promise<EslintScanResult> {
    try {
        const tsconfigPath = findNearestTsconfig(sourcePath);

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
                        "no-unused-vars": "off",
                        eqeqeq: ["error", "always"],
                        "no-unreachable": "error",
                        "no-const-assign": "error",
                        "no-undef": "error",
                        "no-duplicate-imports": "error",
                        "no-console": ["warn", { allow: ["warn", "error"] }],
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
                            projectService: Boolean(tsconfigPath),
                            tsconfigRootDir: tsconfigPath ? path.dirname(tsconfigPath) : sourcePath,
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
                        "@typescript-eslint/no-unused-vars": "off",
                        eqeqeq: ["error", "always"],
                        "no-unreachable": "error",
                        "no-const-assign": "error",
                        "no-undef": "error",
                        "no-duplicate-imports": "error",
                        "no-console": ["warn", { allow: ["warn", "error"] }],
                        ...(tsconfigPath ? {
                            "@typescript-eslint/await-thenable": "error",
                        } : {}),
                    },
                },
            ],
        });

        const results = await eslint.lintFiles(".");
        const lines: string[] = [];
        const files: CodeHealthFileReport[] = [];

        for (const result of results) {
            const filePath = result.filePath.replace(`${sourcePath}${path.sep}`, "");
            if (result.messages.length === 0) continue;

            const issues: CodeHealthIssue[] = result.messages.map((msg) => ({
                source: "eslint",
                severity: msg.severity === 2 ? "error" : "warning",
                location: {
                    line: msg.line ?? null,
                    column: msg.column ?? null,
                    label: msg.line
                        ? `Line ${msg.line}${msg.column ? `:${msg.column}` : ""}`
                        : "Whole File",
                },
                message: msg.message,
                ruleId: msg.ruleId || "eslint:unknown",
            }));

            for (const msg of result.messages) {
                lines.push(`${filePath}:${msg.line}:${msg.column}  ${msg.severity === 2 ? "error" : "warning"}  ${msg.message}  ${msg.ruleId || ""}`);
            }

            files.push({
                filePath,
                absolutePath: result.filePath,
                errorCount: issues.filter((issue) => issue.severity === "error").length,
                warningCount: issues.filter((issue) => issue.severity === "warning").length,
                issues,
            });
        }

        const errorCount = results.reduce((sum, result) => sum + result.errorCount, 0);
        const warningCount = results.reduce((sum, result) => sum + result.warningCount, 0);

        return {
            stdout: lines.join("\n") || `No issues found (${results.length} files scanned)`,
            stderr: "",
            exitCode: errorCount > 0 ? 1 : 0,
            errorCount,
            warningCount,
            files,
        };
    } catch (error: unknown) {
        return {
            stdout: "",
            stderr: error instanceof Error ? error.message : "Unknown ESLint error",
            exitCode: 2,
            errorCount: 0,
            warningCount: 0,
            files: [],
        };
    }
}

interface KnipSandbox {
    cleanup: () => void;
    configPath: string;
    linkedProjectPath: string;
    tempRoot: string;
}

function createKnipSandbox(sourcePath: string): KnipSandbox {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "code-health-knip-"));
    const linkedProjectPath = path.join(tempRoot, "project");
    const configPath = path.join(tempRoot, "knip.json");

    fs.writeFileSync(
        path.join(tempRoot, "package.json"),
        JSON.stringify(
            {
                name: "code-health-knip-sandbox",
                private: true,
                version: "0.0.0",
            },
            null,
            2,
        ),
        "utf8",
    );

    fs.symlinkSync(sourcePath, linkedProjectPath, "dir");
    fs.writeFileSync(
        configPath,
        JSON.stringify(
            {
                include: ["files", "exports"],
                entry: [
                    "project/**/*.{js,jsx,ts,tsx}",
                    "project/**/*.{mjs,cjs}",
                ],
                project: [
                    "project/**/*.{js,jsx,ts,tsx}",
                    "project/**/*.{mjs,cjs}",
                ],
                ignore: [
                    "**/node_modules/**",
                    "**/dist/**",
                    "**/dist-electron/**",
                    "**/release/**",
                    "**/build/**",
                    "**/temp/**",
                    "**/.git/**",
                ],
            },
            null,
            2,
        ),
        "utf8",
    );

    return {
        tempRoot,
        linkedProjectPath,
        configPath,
        cleanup: () => {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        },
    };
}

function mapKnipIssuePath(issuePath: string, sourcePath: string, linkedProjectPath: string) {
    if (issuePath.startsWith(linkedProjectPath)) {
        return path.join(sourcePath, path.relative(linkedProjectPath, issuePath));
    }

    try {
        const resolvedIssuePath = fs.realpathSync.native(issuePath);
        const resolvedSourcePath = fs.realpathSync.native(sourcePath);
        if (resolvedIssuePath.startsWith(resolvedSourcePath)) {
            return resolvedIssuePath;
        }
    } catch {
        // Keep original path when realpath resolution fails.
    }

    return issuePath;
}

async function runKnipScan(sourcePath: string): Promise<KnipScanResult> {
    let sandbox: KnipSandbox | null = null;

    try {
        sandbox = createKnipSandbox(sourcePath);

        const options = await createKnipOptions({
            cwd: sandbox.tempRoot,
            args: { config: sandbox.configPath },
            includedIssueTypes: ["files", "exports"],
            isShowProgress: false,
            isIncludeEntryExports: false,
            isProduction: false,
        });

        const results = await runKnipMain(options);
        const orphanFiles = results.counters.files ?? 0;
        const unusedExports = results.counters.exports ?? 0;

        const lines: string[] = [];

        for (const [fileKey, issueRecord] of Object.entries(results.issues.files)) {
            for (const issue of Object.values(issueRecord)) {
                const mappedPath = mapKnipIssuePath(issue.filePath || fileKey, sourcePath, sandbox.linkedProjectPath);
                lines.push(`[orphan-file] ${path.relative(sourcePath, mappedPath) || path.basename(mappedPath)}`);
            }
        }

        for (const [fileKey, issueRecord] of Object.entries(results.issues.exports)) {
            for (const issue of Object.values(issueRecord)) {
                const issuePath = mapKnipIssuePath(issue.filePath || fileKey, sourcePath, sandbox.linkedProjectPath);
                const location = issue.line ? `:${issue.line}${issue.col ? `:${issue.col}` : ""}` : "";
                lines.push(`[unused-export] ${path.relative(sourcePath, issuePath) || path.basename(issuePath)}${location}  ${issue.symbol}`);
            }
        }

        return {
            stdout: lines.join("\n") || `No issues found (${results.counters.processed ?? 0} files scanned)`,
            stderr: "",
            exitCode: orphanFiles > 0 || unusedExports > 0 ? 1 : 0,
            orphanFiles,
            unusedExports,
            files: mergeFileReports([
                ...Object.entries(results.issues.files).map(([fileKey, issueRecord]) => {
                    const issues = Object.values(issueRecord).map((issue) => {
                        const mappedPath = mapKnipIssuePath(issue.filePath || fileKey, sourcePath, sandbox.linkedProjectPath);
                        return {
                            source: "knip" as const,
                            severity: "error" as const,
                            location: {
                                line: null,
                                column: null,
                                label: "Whole File",
                            },
                            message: `Orphan file '${path.relative(sourcePath, mappedPath) || path.basename(mappedPath)}'`,
                            ruleId: "knip:files",
                        };
                    });

                    const mappedIssuePath = Object.values(issueRecord)[0]?.filePath
                        ? mapKnipIssuePath(Object.values(issueRecord)[0].filePath, sourcePath, sandbox.linkedProjectPath)
                        : mapKnipIssuePath(fileKey, sourcePath, sandbox.linkedProjectPath);

                    return {
                        filePath: path.relative(sourcePath, mappedIssuePath) || path.basename(mappedIssuePath),
                        absolutePath: mappedIssuePath,
                        errorCount: issues.length,
                        warningCount: 0,
                        issues,
                    };
                }),
                ...Object.entries(results.issues.exports).map(([fileKey, issueRecord]) => {
                    const issues = Object.values(issueRecord).map((issue) => {
                        const issuePath = mapKnipIssuePath(issue.filePath || fileKey, sourcePath, sandbox.linkedProjectPath);
                        return {
                            source: "knip" as const,
                            severity: "error" as const,
                            location: {
                                line: issue.line ?? null,
                                column: issue.col ?? null,
                                label: issue.line
                                    ? `Line ${issue.line}${issue.col ? `:${issue.col}` : ""}`
                                    : "Whole File",
                            },
                            message: `Unused export '${issue.symbol}'`,
                            ruleId: "knip:exports",
                        };
                    });

                    const mappedIssuePath = Object.values(issueRecord)[0]?.filePath
                        ? mapKnipIssuePath(Object.values(issueRecord)[0].filePath, sourcePath, sandbox.linkedProjectPath)
                        : mapKnipIssuePath(fileKey, sourcePath, sandbox.linkedProjectPath);

                    return {
                        filePath: path.relative(sourcePath, mappedIssuePath) || path.basename(mappedIssuePath),
                        absolutePath: mappedIssuePath,
                        errorCount: issues.length,
                        warningCount: 0,
                        issues,
                    };
                }),
            ]),
        };
    } catch (error: unknown) {
        return {
            stdout: "",
            stderr: error instanceof Error ? error.message : "Unknown Knip error",
            exitCode: 2,
            orphanFiles: 0,
            unusedExports: 0,
            files: [],
        };
    } finally {
        sandbox?.cleanup();
    }
}

function mergeFileReports(fileReports: CodeHealthFileReport[]) {
    const grouped = new Map<string, CodeHealthFileReport>();

    for (const report of fileReports) {
        const existing = grouped.get(report.filePath);
        if (!existing) {
            grouped.set(report.filePath, {
                filePath: report.filePath,
                absolutePath: report.absolutePath,
                errorCount: report.errorCount,
                warningCount: report.warningCount,
                issues: [...report.issues],
            });
            continue;
        }

        existing.errorCount += report.errorCount;
        existing.warningCount += report.warningCount;
        existing.issues.push(...report.issues);
    }

    return [...grouped.values()].sort((a, b) => a.filePath.localeCompare(b.filePath));
}

export function registerCodeHealthHandler() {
    ipcMain.handle("run-code-health", async (_event, sourcePath: string, mode: CodeHealthMode) => {
        const shouldRunEslint = mode === "full" || mode === "eslint";
        const shouldRunKnip = mode === "full" || mode === "knip";

        const [eslintResult, knipResult] = await Promise.all([
            shouldRunEslint ? runEslintScan(sourcePath) : Promise.resolve(createEmptyEslintResult()),
            shouldRunKnip ? runKnipScan(sourcePath) : Promise.resolve(createEmptyKnipResult()),
        ]);

        const hasHardError = eslintResult.exitCode === 2 || knipResult.exitCode === 2;
        const hasIssues = eslintResult.errorCount > 0
            || eslintResult.warningCount > 0
            || knipResult.orphanFiles > 0
            || knipResult.unusedExports > 0;
        const fileReports = mergeFileReports([...eslintResult.files, ...knipResult.files]);
        const totalIssueCount = fileReports.reduce((sum, file) => sum + file.errorCount + file.warningCount, 0);
        const knipErrorCount = knipResult.orphanFiles + knipResult.unusedExports;
        const eslintErrorCount = eslintResult.errorCount;
        const eslintWarningCount = eslintResult.warningCount;
        const totalPenalty = (knipErrorCount * HEALTH_WEIGHT_CRITICAL)
            + (eslintErrorCount * HEALTH_WEIGHT_CRITICAL)
            + (eslintWarningCount * HEALTH_WEIGHT_MINOR);
        const healthScore = Math.max(0, HEALTH_SCORE_MAX - totalPenalty);

        return {
            mode,
            exitCode: hasHardError ? 2 : hasIssues ? 1 : 0,
            summary: {
                status: hasHardError ? "error" : hasIssues ? "issues" : "success",
                eslintErrors: eslintResult.errorCount,
                eslintWarnings: eslintResult.warningCount,
                knipOrphanFiles: knipResult.orphanFiles,
                knipUnusedExports: knipResult.unusedExports,
                totalFiles: fileReports.length,
                totalIssues: totalIssueCount,
                healthScore,
            },
            eslint: eslintResult,
            knip: knipResult,
            files: fileReports,
        };
    });
}
