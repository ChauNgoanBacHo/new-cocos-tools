import { ipcMain } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import { ESLint } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";

type CodeHealthMode = "full" | "eslint" | "knip";
type CodeHealthSource = "eslint" | "knip" | "typescript";
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
    unresolvedImports: number;
    files: CodeHealthFileReport[];
}

interface TypescriptScanResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    errorCount: number;
    files: CodeHealthFileReport[];
}

const MIN_TYPESCRIPT_TARGET = ts.ScriptTarget.ES2017;
const MIN_TYPESCRIPT_LIB = "lib.es2017.d.ts";
const IGNORED_TYPESCRIPT_MODULES = new Set(["cc"]);
const IGNORED_TYPESCRIPT_PROPERTIES = new Set([
    "node",
    "schedule",
    "scheduleOnce",
    "unschedule",
    "unscheduleAllCallbacks",
]);

function findNearestUpwardFile(sourcePath: string, fileName: string) {
    let currentPath = path.resolve(sourcePath);

    while (true) {
        const targetPath = path.join(currentPath, fileName);
        if (fs.existsSync(targetPath)) {
            return targetPath;
        }

        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) {
            return null;
        }

        currentPath = parentPath;
    }
}

function findNearestTsconfig(sourcePath: string) {
    return findNearestUpwardFile(sourcePath, "tsconfig.json");
}

function findNearestPackageJson(sourcePath: string) {
    return findNearestUpwardFile(sourcePath, "package.json");
}

function getWorkspaceRoot(sourcePath: string) {
    const nearestPackageJson = findNearestPackageJson(sourcePath);
    if (nearestPackageJson) {
        return path.dirname(nearestPackageJson);
    }

    const nearestTsconfig = findNearestTsconfig(sourcePath);
    if (nearestTsconfig) {
        return path.dirname(nearestTsconfig);
    }

    return path.resolve(sourcePath);
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
        unresolvedImports: 0,
        files: [],
    };
}

function createEmptyTypescriptResult(): TypescriptScanResult {
    return {
        stdout: "TypeScript scan skipped",
        stderr: "",
        exitCode: 0,
        errorCount: 0,
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
                        "no-unreachable": "error",
                        "no-const-assign": "error",
                        "no-undef": "error",
                        "no-duplicate-imports": "error",
                        "no-console": ["warn", { allow: ["warn", "error"] }],
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

async function runTypescriptScan(sourcePath: string): Promise<TypescriptScanResult> {
    try {
        const workspaceRoot = getWorkspaceRoot(sourcePath);
        const tsconfigPath = findNearestTsconfig(sourcePath);
        const sourceRoot = path.resolve(sourcePath);
        const lines: string[] = [];

        let fileNames: string[] = [];
        let options: ts.CompilerOptions = {
            noEmit: true,
            allowJs: true,
            checkJs: false,
            skipLibCheck: true,
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.NodeJs,
        };

        if (tsconfigPath) {
            const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
            if (configFile.error) {
                throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
            }

            const parsedConfig = ts.parseJsonConfigFileContent(
                configFile.config,
                ts.sys,
                path.dirname(tsconfigPath),
                { noEmit: true },
                tsconfigPath,
            );

            if (parsedConfig.errors.length > 0) {
                throw new Error(
                    parsedConfig.errors
                        .map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n"))
                        .join("\n"),
                );
            }

            fileNames = parsedConfig.fileNames;
            options = {
                ...parsedConfig.options,
                noEmit: true,
            };
        } else {
            fileNames = getScriptCandidatePaths(sourcePath);
        }

        const currentTarget = options.target ?? ts.ScriptTarget.ES3;
        if (currentTarget < MIN_TYPESCRIPT_TARGET) {
            options.target = MIN_TYPESCRIPT_TARGET;
        }

        const currentLib = options.lib ?? [];
        if (!currentLib.some((entry) => entry.toLowerCase() === MIN_TYPESCRIPT_LIB)) {
            options.lib = [...new Set([...currentLib, MIN_TYPESCRIPT_LIB])];
        }

        const program = ts.createProgram(fileNames, options);
        const diagnostics = ts.getPreEmitDiagnostics(program);
        const fileReports = new Map<string, CodeHealthFileReport>();

        for (const diagnostic of diagnostics) {
            const diagnosticFile = diagnostic.file?.fileName;
            if (!diagnosticFile) continue;

            const normalizedFilePath = normalizeFilePath(diagnosticFile);
            if (!isPathInside(sourceRoot, normalizedFilePath)) continue;

            const start = diagnostic.start ?? 0;
            const position = diagnostic.file.getLineAndCharacterOfPosition(start);
            const line = position.line + 1;
            const column = position.character + 1;
            const relativePath = path.relative(sourceRoot, normalizedFilePath) || path.basename(normalizedFilePath);
            const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
            if (diagnostic.code === 2307) {
                const ignoredModuleMatch = message.match(/Cannot find module '([^']+)'/);
                if (ignoredModuleMatch && IGNORED_TYPESCRIPT_MODULES.has(ignoredModuleMatch[1])) {
                    continue;
                }
            }
            if (diagnostic.code === 2339) {
                const ignoredPropertyMatch = message.match(/Property '([^']+)' does not exist on type /);
                if (ignoredPropertyMatch && IGNORED_TYPESCRIPT_PROPERTIES.has(ignoredPropertyMatch[1])) {
                    continue;
                }
            }
            const ruleId = `ts(${diagnostic.code})`;

            lines.push(`${relativePath}:${line}:${column}  error  ${message}  ${ruleId}`);

            const issue: CodeHealthIssue = {
                source: "typescript",
                severity: "error",
                location: {
                    line,
                    column,
                    label: `Line ${line}:${column}`,
                },
                message,
                ruleId,
            };

            const existing = fileReports.get(relativePath);
            if (!existing) {
                fileReports.set(relativePath, {
                    filePath: relativePath,
                    absolutePath: normalizedFilePath,
                    errorCount: 1,
                    warningCount: 0,
                    issues: [issue],
                });
                continue;
            }

            existing.errorCount += 1;
            existing.issues.push(issue);
        }

        const files = [...fileReports.values()].sort((a, b) => a.filePath.localeCompare(b.filePath));
        const errorCount = files.reduce((sum, file) => sum + file.errorCount, 0);

        return {
            stdout: lines.join("\n") || `No issues found (${fileNames.length} files checked)`,
            stderr: "",
            exitCode: errorCount > 0 ? 1 : 0,
            errorCount,
            files,
        };
    } catch (error: unknown) {
        return {
            stdout: "",
            stderr: error instanceof Error ? error.message : "Unknown TypeScript error",
            exitCode: 2,
            errorCount: 0,
            files: [],
        };
    }
}

const UUID_BASE64_KEY_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function compressUuid(uuid: string, reservedLength: 2 | 5): string | null {
    const cleanUuid = uuid.replace(/-/g, "").toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(cleanUuid)) return null;

    let compressed = cleanUuid.slice(0, reservedLength);
    for (let i = reservedLength; i < 32; i += 3) {
        const chunk = cleanUuid.slice(i, i + 3);
        if (chunk.length !== 3) return null;

        const value = parseInt(chunk, 16);
        compressed += UUID_BASE64_KEY_CHARS[value >> 6];
        compressed += UUID_BASE64_KEY_CHARS[value & 0x3f];
    }

    return compressed;
}

function getUuidRefKeys(uuid: string): string[] {
    const normalizedUuid = uuid.toLowerCase();
    const dashlessUuid = normalizedUuid.replace(/-/g, "");
    const keys = new Set<string>([uuid, normalizedUuid, dashlessUuid]);
    const compressedUuid = compressUuid(normalizedUuid, 5);
    const minCompressedUuid = compressUuid(normalizedUuid, 2);

    if (compressedUuid) keys.add(compressedUuid);
    if (minCompressedUuid) keys.add(minCompressedUuid);

    return Array.from(keys);
}

function hasUuidRef(content: string, uuid: string): boolean {
    return getUuidRefKeys(uuid).some((key) => content.includes(key));
}

function walkFilesByExtensions(rootDir: string, extensions: string[]): string[] {
    const results: string[] = [];

    function walk(currentDir: string) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
                continue;
            }

            if (extensions.some((ext) => entry.name.endsWith(ext))) {
                results.push(fullPath);
            }
        }
    }

    if (fs.existsSync(rootDir)) {
        walk(rootDir);
    }

    return results;
}

function isDeclarationFile(filePath: string) {
    return filePath.endsWith(".d.ts");
}

function normalizeFilePath(filePath: string) {
    return path.normalize(filePath);
}

function isPathInside(parentPath: string, childPath: string) {
    const relativePath = path.relative(parentPath, childPath);
    return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function getScriptCandidatePaths(rootPath: string) {
    return walkFilesByExtensions(rootPath, [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"])
        .filter((filePath) => !isDeclarationFile(filePath))
        .map(normalizeFilePath);
}

function getTsCandidatePaths(rootPath: string) {
    const tsFiles = getScriptCandidatePaths(rootPath);
    const tsMetaFiles = walkFilesByExtensions(rootPath, [".ts.meta"]);

    return Array.from(new Set([
        ...tsFiles,
        ...tsMetaFiles.map((filePath) => filePath.slice(0, -".meta".length)),
    ].map(normalizeFilePath))).filter((filePath) => !isDeclarationFile(filePath));
}

function resolveTsImport(fromFile: string, importPath: string, tsCandidateSet: Set<string>) {
    if (!importPath.startsWith(".")) return null;

    const basePath = path.resolve(path.dirname(fromFile), importPath);
    const candidates = [
        basePath,
        `${basePath}.ts`,
        `${basePath}.tsx`,
        `${basePath}.js`,
        `${basePath}.jsx`,
        `${basePath}.mjs`,
        `${basePath}.cjs`,
        path.join(basePath, "index.ts"),
        path.join(basePath, "index.tsx"),
        path.join(basePath, "index.js"),
        path.join(basePath, "index.jsx"),
        path.join(basePath, "index.mjs"),
        path.join(basePath, "index.cjs"),
    ].map(normalizeFilePath);

    return candidates.find((candidate) => tsCandidateSet.has(candidate) && fs.existsSync(candidate)) ?? null;
}

function getTsImports(filePath: string, tsCandidateSet: Set<string>) {
    if (!fs.existsSync(filePath)) return [];

    const content = fs.readFileSync(filePath, "utf8");
    const importPaths = new Set<string>();
    const importPatterns = [
        /\bimport\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g,
        /\bexport\s+(?:type\s+)?[^'"]*?\s+from\s+["']([^"']+)["']/g,
        /\brequire\(\s*["']([^"']+)["']\s*\)/g,
    ];

    for (const pattern of importPatterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(content)) !== null) {
            importPaths.add(match[1]);
        }
    }

    return Array.from(importPaths)
        .map((importPath) => resolveTsImport(filePath, importPath, tsCandidateSet))
        .filter((resolvedPath): resolvedPath is string => Boolean(resolvedPath));
}

function getSceneReferencedScriptPaths(sourcePath: string) {
    const tsMetaFiles = walkFilesByExtensions(sourcePath, [".ts.meta"]);
    const sceneAndPrefabFiles = walkFilesByExtensions(sourcePath, [".scene", ".prefab"]);
    const sceneAndPrefabContent = sceneAndPrefabFiles
        .map((filePath) => fs.readFileSync(filePath, "utf8"))
        .join("\n");
    const referencedScriptPaths = new Set<string>();

    for (const metaPath of tsMetaFiles) {
        try {
            const metaData = JSON.parse(fs.readFileSync(metaPath, "utf8")) as { uuid?: unknown };
            if (typeof metaData.uuid !== "string") continue;
            if (!hasUuidRef(sceneAndPrefabContent, metaData.uuid)) continue;

            referencedScriptPaths.add(metaPath.slice(0, -".meta".length));
        } catch {
            // Ignore broken meta files and let Knip handle the remaining code graph.
        }
    }

    return referencedScriptPaths;
}

function getReachableTsScriptPaths(sourcePath: string, workspaceRoot: string) {
    const tsCandidatePaths = getTsCandidatePaths(workspaceRoot);
    const tsCandidateSet = new Set(tsCandidatePaths.map(normalizeFilePath));
    const entryScripts = [
        ...getSceneReferencedScriptPaths(sourcePath),
        ...[
            "index.ts",
            "index.tsx",
            "main.ts",
            "main.tsx",
            "app.ts",
            "app.tsx",
            "App.ts",
            "App.tsx",
            "game.ts",
            "game.tsx",
            "Game.ts",
            "Game.tsx",
            "boot.ts",
            "boot.tsx",
            "Boot.ts",
            "Boot.tsx",
            path.join("src", "index.ts"),
            path.join("src", "index.tsx"),
            path.join("src", "main.ts"),
            path.join("src", "main.tsx"),
            path.join("src", "app.ts"),
            path.join("src", "app.tsx"),
            path.join("src", "App.ts"),
            path.join("src", "App.tsx"),
            path.join("src", "game.ts"),
            path.join("src", "game.tsx"),
            path.join("src", "Game.ts"),
            path.join("src", "Game.tsx"),
            path.join("src", "boot.ts"),
            path.join("src", "boot.tsx"),
            path.join("src", "Boot.ts"),
            path.join("src", "Boot.tsx"),
        ].map((relativePath) => path.join(sourcePath, relativePath)),
    ]
        .map(normalizeFilePath)
        .filter((filePath) => tsCandidateSet.has(filePath));
    const reachableScripts = new Set<string>();
    const queue = [...new Set(entryScripts)];

    while (queue.length > 0) {
        const currentFile = queue.shift();
        if (!currentFile || reachableScripts.has(currentFile)) continue;

        reachableScripts.add(currentFile);

        for (const importedFile of getTsImports(currentFile, tsCandidateSet)) {
            if (!reachableScripts.has(importedFile)) {
                queue.push(importedFile);
            }
        }
    }

    return reachableScripts;
}

function getCustomUnresolvedImportReports(sourcePath: string, tsCandidateSet: Set<string>) {
    const reports: CodeHealthFileReport[] = [];

    for (const filePath of tsCandidateSet) {
        if (!isPathInside(sourcePath, filePath)) continue;
        if (!fs.existsSync(filePath)) continue;

        const content = fs.readFileSync(filePath, "utf8");
        const importPatterns = [
            /\bimport\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g,
            /\bexport\s+(?:type\s+)?[^'"]*?\s+from\s+["']([^"']+)["']/g,
            /\brequire\(\s*["']([^"']+)["']\s*\)/g,
        ];

        for (const pattern of importPatterns) {
            let match: RegExpExecArray | null;
            while ((match = pattern.exec(content)) !== null) {
                const importPath = match[1];
                if (!importPath.startsWith(".")) continue;
                if (resolveTsImport(filePath, importPath, tsCandidateSet)) continue;

                const beforeMatch = content.slice(0, match.index);
                const lines = beforeMatch.split("\n");
                const line = lines.length;
                const column = lines[lines.length - 1].length + 1;
                const relativePath = path.relative(sourcePath, filePath) || path.basename(filePath);

                reports.push({
                    filePath: relativePath,
                    absolutePath: filePath,
                    errorCount: 1,
                    warningCount: 0,
                    issues: [{
                        source: "knip",
                        severity: "error",
                        location: {
                            line,
                            column,
                            label: `Line ${line}:${column}`,
                        },
                        message: `Unresolved import '${importPath}'`,
                        ruleId: "knip:unresolved",
                    }],
                });
            }
        }
    }

    return reports;
}

async function runKnipScan(sourcePath: string): Promise<KnipScanResult> {
    try {
        const workspaceRoot = getWorkspaceRoot(sourcePath);
        const tsCandidatePaths = getTsCandidatePaths(workspaceRoot);
        const tsCandidateSet = new Set(tsCandidatePaths.map(normalizeFilePath));
        const reachableTsScriptPaths = getReachableTsScriptPaths(sourcePath, workspaceRoot);
        const customUnresolvedImportReports = getCustomUnresolvedImportReports(sourcePath, tsCandidateSet);
        const orphanCandidatePaths = getScriptCandidatePaths(sourcePath)
            .filter((filePath) => !reachableTsScriptPaths.has(filePath));
        const orphanFileReports = orphanCandidatePaths.map((filePath) => {
            const relativePath = path.relative(sourcePath, filePath) || path.basename(filePath);
            return {
                filePath: relativePath,
                absolutePath: filePath,
                errorCount: 1,
                warningCount: 0,
                issues: [{
                    source: "knip" as const,
                    severity: "error" as const,
                    location: {
                        line: null,
                        column: null,
                        label: "Whole File",
                    },
                    message: `Orphan file '${relativePath}'`,
                    ruleId: "knip:files",
                }],
            };
        });

        const unusedExportReports: CodeHealthFileReport[] = [];
        const unresolvedImportReports = mergeFileReports(customUnresolvedImportReports).flatMap((report) => report.issues.map((issue) => ({
            filePath: report.filePath,
            absolutePath: report.absolutePath,
            errorCount: issue.severity === "error" ? 1 : 0,
            warningCount: issue.severity === "warning" ? 1 : 0,
            issues: [issue],
        })));

        const files = mergeFileReports([
            ...orphanFileReports,
            ...unusedExportReports,
            ...unresolvedImportReports,
        ]);
        const orphanFiles = orphanFileReports.length;
        const unusedExports = unusedExportReports.length;
        const unresolvedImports = unresolvedImportReports.length;
        const lines = [
            ...orphanFileReports.map((report) => `[orphan-file] ${report.filePath}`),
            ...unusedExportReports.map((report) => {
                const issue = report.issues[0];
                const location = issue.location.line
                    ? `:${issue.location.line}${issue.location.column ? `:${issue.location.column}` : ""}`
                    : "";
                return `[unused-export] ${report.filePath}${location}  ${issue.message}`;
            }),
            ...unresolvedImportReports.map((report) => {
                const issue = report.issues[0];
                const location = issue.location.line
                    ? `:${issue.location.line}${issue.location.column ? `:${issue.location.column}` : ""}`
                    : "";
                return `[unresolved-import] ${report.filePath}${location}  ${issue.message}`;
            }),
        ];

        return {
            stdout: lines.join("\n") || `No issues found (${getScriptCandidatePaths(sourcePath).length} files scanned)`,
            stderr: "",
            exitCode: orphanFiles > 0 || unusedExports > 0 || unresolvedImports > 0 ? 1 : 0,
            orphanFiles,
            unusedExports,
            unresolvedImports,
            files,
        };
    } catch (error: unknown) {
        return {
            stdout: "",
            stderr: error instanceof Error ? error.message : "Unknown Knip error",
            exitCode: 2,
            orphanFiles: 0,
            unusedExports: 0,
            unresolvedImports: 0,
            files: [],
        };
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
        const shouldRunTypescript = mode === "full";

        const [eslintResult, typescriptResult] = await Promise.all([
            shouldRunEslint ? runEslintScan(sourcePath) : Promise.resolve(createEmptyEslintResult()),
            shouldRunTypescript ? runTypescriptScan(sourcePath) : Promise.resolve(createEmptyTypescriptResult()),
        ]);
        const knipResult = createEmptyKnipResult();

        const hasHardError = eslintResult.exitCode === 2 || typescriptResult.exitCode === 2;
        const hasIssues = eslintResult.errorCount > 0
            || eslintResult.warningCount > 0
            || typescriptResult.errorCount > 0;
        const fileReports = mergeFileReports([...eslintResult.files, ...typescriptResult.files]);
        const totalIssueCount = fileReports.reduce((sum, file) => sum + file.errorCount + file.warningCount, 0);
        const eslintErrorCount = eslintResult.errorCount;
        const eslintWarningCount = eslintResult.warningCount;
        const typescriptErrorCount = typescriptResult.errorCount;
        const totalPenalty = (typescriptErrorCount * HEALTH_WEIGHT_CRITICAL)
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
                typescriptErrors: typescriptResult.errorCount,
                knipOrphanFiles: knipResult.orphanFiles,
                knipUnusedExports: knipResult.unusedExports,
                knipUnresolvedImports: knipResult.unresolvedImports,
                totalFiles: fileReports.length,
                totalIssues: totalIssueCount,
                healthScore,
            },
            eslint: eslintResult,
            knip: knipResult,
            typescript: typescriptResult,
            files: fileReports,
        };
    });
}
