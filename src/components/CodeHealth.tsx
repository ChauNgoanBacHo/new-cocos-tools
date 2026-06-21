import { useEffect, useMemo, useState } from "react";
import { useStoredState } from "../hooks/useStoredState";

type CodeHealthMode = "full" | "eslint";
type CodeHealthSource = "eslint" | "typescript";
type CodeHealthSeverity = "error" | "warning";
type CodeHealthFilter = "all" | "typescript" | "eslint-error" | "eslint-warning";

const NICE_TO_HAVE_RULE_IDS = new Set([
    "max-lines-per-function",
    "max-params",
    "complexity",
    "max-depth",
]);

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

interface CodeHealthResult {
    mode: CodeHealthMode;
    exitCode: number;
    summary: {
        status: "success" | "issues" | "error";
        eslintErrors: number;
        eslintWarnings: number;
        typescriptErrors: number;
        totalFiles: number;
        totalIssues: number;
        healthScore: number;
    };
    eslint: {
        stdout: string;
        stderr: string;
        exitCode: number;
        errorCount: number;
        warningCount: number;
        files: CodeHealthFileReport[];
    };
    typescript: {
        stdout: string;
        stderr: string;
        exitCode: number;
        errorCount: number;
        files: CodeHealthFileReport[];
    };
    files: CodeHealthFileReport[];
}

const FILTER_META: Record<CodeHealthFilter, { label: string; accent: string }> = {
    all: { label: "All", accent: "bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-200" },
    typescript: { label: "TypeScript", accent: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950/40 dark:text-fuchsia-300" },
    "eslint-error": { label: "ESLint Error", accent: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300" },
    "eslint-warning": { label: "ESLint Warn", accent: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
};

function getHealthTone(score: number) {
    if (score >= 90) {
        return "text-emerald-600 dark:text-emerald-400";
    }
    if (score >= 70) {
        return "text-amber-600 dark:text-amber-400";
    }
    return "text-rose-600 dark:text-rose-400";
}

function formatCountBadge(label: string, count: number, tone: string) {
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>
            {label} {count}
        </span>
    );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className={`h-4 w-4 text-slate-500 dark:text-zinc-400 transition-transform duration-200 ${
                expanded ? "rotate-90" : "rotate-0"
            }`}>
            <path
                d="M7 5l6 5-6 5"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
            />
        </svg>
    );
}

function isNiceToHaveIssue(issue: CodeHealthIssue) {
    return issue.source === "eslint"
        && issue.severity === "warning"
        && NICE_TO_HAVE_RULE_IDS.has(issue.ruleId);
}

function isPrimaryWarning(issue: CodeHealthIssue) {
    return issue.source === "eslint"
        && issue.severity === "warning"
        && !isNiceToHaveIssue(issue);
}

export default function CodeHealth() {
    const [sourcePath, setSourcePath] = useStoredState<string>("code-health-source-path", "");
    const [autoRunKey, setAutoRunKey, autoRunReady] = useStoredState<string>("code-health-auto-run-key", "");
    const [isRunning, setIsRunning] = useState(false);
    const [activeMode, setActiveMode] = useState<CodeHealthMode>("full");
    const [result, setResult] = useState<CodeHealthResult | null>(null);
    const [status, setStatus] = useState<{ type: "success" | "error" | null; message: string }>({
        type: null,
        message: "",
    });
    const [activeFilter, setActiveFilter] = useState<CodeHealthFilter>("all");
    const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});

    const handleSelectSourcePath = async () => {
        const folder = await window.electronAPI.selectFolder();
        if (folder) setSourcePath(folder);
    };

    const runScan = async (mode: CodeHealthMode) => {
        if (!sourcePath.trim()) {
            setStatus({ type: "error", message: "Vui lòng chọn Source Code Folder!" });
            return;
        }

        setActiveMode(mode);
        setIsRunning(true);
        setResult(null);
        setStatus({ type: null, message: "" });
        setExpandedFiles({});
        setActiveFilter("all");

        try {
            const res = await window.electronAPI.runCodeHealth(sourcePath, mode);
            setResult(res);
            setExpandedFiles(
                Object.fromEntries(res.files.slice(0, 2).map((file) => [file.filePath, true])),
            );

            if (res.summary.status === "success") {
                setStatus({ type: "success", message: "Code Health scan thành công" });
            } else if (res.summary.status === "issues") {
                setStatus({ type: null, message: "" });
            } else {
                setStatus({ type: "error", message: "Code Health gặp lỗi khi chạy scan." });
            }
        } catch {
            setStatus({ type: "error", message: "Lỗi khi chạy Code Health. Kiểm tra lại đường dẫn source." });
        } finally {
            setIsRunning(false);
        }
    };

    const handleClearForm = () => {
        setSourcePath("");
        setResult(null);
        setStatus({ type: null, message: "" });
        setActiveMode("full");
        setActiveFilter("all");
        setExpandedFiles({});
    };

    const handleOpenInVSCode = async (file: CodeHealthFileReport, issue: CodeHealthIssue) => {
        const response = await window.electronAPI.openInVSCode(
            file.absolutePath,
            issue.location.line,
            issue.location.column,
        );

        if (!response.ok) {
            setStatus({
                type: "error",
                message: response.error || "Không mở được file trong VS Code.",
            });
        }
    };

    const filteredFiles = useMemo(() => {
        if (!result) return [];

        return result.files.filter((file) => {
            if (activeFilter === "all") {
                return true;
            }

            if (activeFilter === "typescript") {
                return file.issues.some((issue) => issue.source === "typescript");
            }

            if (activeFilter === "eslint-error") {
                return file.issues.some((issue) => issue.source === "eslint" && issue.severity === "error");
            }

            return file.issues.some((issue) => isPrimaryWarning(issue));
        });
    }, [activeFilter, result]);

    const primaryFiles = useMemo(() => filteredFiles
        .map((file) => {
            const issues = file.issues.filter((issue) => !isNiceToHaveIssue(issue));
            return {
                ...file,
                errorCount: issues.filter((issue) => issue.severity === "error").length,
                warningCount: issues.filter((issue) => issue.severity === "warning").length,
                issues,
            };
        })
        .filter((file) => file.issues.length > 0), [filteredFiles]);

    const niceToHaveFiles = useMemo(() => filteredFiles
        .map((file) => {
            const issues = file.issues.filter((issue) => isNiceToHaveIssue(issue));
            return {
                ...file,
                errorCount: 0,
                warningCount: issues.length,
                issues,
            };
        })
        .filter((file) => file.issues.length > 0), [filteredFiles]);

    const filterCounts = useMemo(() => {
        if (!result) {
            return {
                all: 0,
                typescript: 0,
                "eslint-error": 0,
                "eslint-warning": 0,
                "nice-to-have": 0,
            };
        }

        const allIssues = result.files.flatMap((file) => file.issues);
        const primaryWarnings = allIssues.filter((issue) => isPrimaryWarning(issue)).length;
        const niceToHaveWarnings = allIssues.filter((issue) => isNiceToHaveIssue(issue)).length;

        return {
            all: result.summary.totalIssues,
            typescript: result.summary.typescriptErrors,
            "eslint-error": result.summary.eslintErrors,
            "eslint-warning": primaryWarnings,
            "nice-to-have": niceToHaveWarnings,
        };
    }, [result]);

    const toggleExpanded = (filePath: string) => {
        setExpandedFiles((current) => ({
            ...current,
            [filePath]: !current[filePath],
        }));
    };

    const statusPillClassName = result?.summary.status === "success"
        ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400"
        : result?.summary.status === "issues"
            ? "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400"
            : "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400";

    const healthScoreTone = getHealthTone(result?.summary.healthScore ?? 100);

    useEffect(() => {
        if (!autoRunReady || !autoRunKey || !sourcePath.trim() || isRunning) {
            return;
        }

        void runScan("full");
        setAutoRunKey("");
    }, [autoRunKey, autoRunReady, isRunning, setAutoRunKey, sourcePath]);

    const renderFileList = (files: CodeHealthFileReport[], emptyMessage: string) => {
        if (files.length === 0) {
            return (
                <div className="rounded-2xl border border-dashed border-slate-300 dark:border-zinc-700 p-8 text-center text-sm text-slate-500 dark:text-zinc-400">
                    {emptyMessage}
                </div>
            );
        }

        return files.map((file) => {
            const isExpanded = Boolean(expandedFiles[file.filePath]);
            const typescriptCount = file.issues.filter((issue) => issue.source === "typescript").length;
            const eslintErrorCount = file.issues.filter((issue) => issue.source === "eslint" && issue.severity === "error").length;
            const eslintWarningCount = file.issues.filter((issue) => issue.source === "eslint" && issue.severity === "warning").length;

            return (
                <div
                    key={file.filePath}
                    className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-sm dark:border-white/5 dark:bg-[#1f2430]">
                    <button
                        type="button"
                        onClick={() => toggleExpanded(file.filePath)}
                        className="w-full flex flex-col gap-3 bg-slate-50 px-5 py-3 border-b border-slate-200 hover:bg-[#f3f0ff] transition-all text-left dark:bg-white/5 dark:border-white/5 dark:hover:bg-white/10 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                            <span className="flex items-center justify-center">
                                <ChevronIcon expanded={isExpanded} />
                            </span>
                            <span className="font-semibold text-slate-800 break-all dark:text-zinc-100">
                                {file.filePath}
                            </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {typescriptCount > 0 && formatCountBadge("TypeScript", typescriptCount, "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950/40 dark:text-fuchsia-300")}
                            {eslintErrorCount > 0 && formatCountBadge("ESLint Error", eslintErrorCount, "bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-300")}
                            {eslintWarningCount > 0 && formatCountBadge("ESLint Warn", eslintWarningCount, "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300")}
                        </div>
                    </button>

                    {isExpanded && (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-50 border-y border-slate-200 dark:bg-[#1b2029] dark:border-white/5">
                                    <tr className="text-left text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-zinc-400">
                                        <th className="px-4 py-3 font-mono w-[120px] min-w-[120px] max-w-[120px] whitespace-nowrap">Source</th>
                                        <th className="px-4 py-3 font-mono w-[140px] min-w-[140px] max-w-[140px] whitespace-nowrap">Location</th>
                                        <th className="px-4 py-3 font-mono">Message</th>
                                        <th className="px-4 py-3 font-mono min-w-[112px] whitespace-nowrap">Rule ID</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {file.issues.map((issue, index) => (
                                        <tr
                                            key={`${file.filePath}-${issue.ruleId}-${index}`}
                                            className="border-b border-slate-200 last:border-0 align-top dark:border-white/5">
                                            <td className="px-4 py-3 w-[120px] min-w-[120px] max-w-[120px] whitespace-nowrap">
                                                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                                    issue.source === "typescript"
                                                            ? "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950/40 dark:text-fuchsia-300"
                                                        : issue.severity === "error"
                                                            ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                                                            : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                                                }`}>
                                                    {issue.source === "typescript" ? "TypeScript" : "ESLint"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-600 font-mono whitespace-nowrap w-[140px] min-w-[140px] max-w-[140px] dark:text-zinc-300">
                                                <button
                                                    type="button"
                                                    onClick={() => void handleOpenInVSCode(file, issue)}
                                                    className="text-left text-[#c2b7ff] hover:text-[#ddd6ff] hover:underline cursor-pointer">
                                                    {issue.location.label}
                                                </button>
                                            </td>
                                            <td className="px-4 py-3 text-slate-700 dark:text-zinc-100">
                                                {issue.message}
                                            </td>
                                            <td className="px-4 py-3 text-slate-500 font-mono whitespace-nowrap min-w-[112px] dark:text-zinc-400">
                                                {issue.ruleId}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            );
        });
    };

    return (
        <div>
            <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 dark:border-zinc-700 pb-4">
                <div className="text-left">
                    <h2 className="text-2xl font-bold text-[#9b8cff] mb-1">
                        Code Health
                    </h2>
                    <p className="text-slate-500 dark:text-zinc-400 text-xs">
                        Báo cáo Typescript và Eslint theo từng file
                    </p>
                </div>
            </div>

            <div className="bg-white border border-slate-200 dark:bg-[#2b3140] dark:border-white/5 rounded-2xl shadow-[0_18px_36px_rgba(148,163,184,0.16)] dark:shadow-[0_18px_36px_rgba(10,12,18,0.28)] overflow-hidden">
                <div className="py-6 space-y-6">
                    {status.type && (
                        <div className="px-6">
                            <div
                            className={`p-4 rounded-xl border text-sm font-medium transition-all ${
                                status.type === "success"
                                    ? "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-400"
                                    : "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700 text-red-800 dark:text-red-400"
                            }`}>
                                {status.message}
                            </div>
                        </div>
                    )}

                    <div className="px-6 pb-6 space-y-4">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-zinc-600 pb-2.5 mb-2">
                            <div className="flex items-center gap-2">
                                <svg className="h-4 w-4 text-[#b7a8ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5A1.75 1.75 0 015.5 5.75h4l1.5 1.75h7a1.75 1.75 0 011.75 1.75v7A1.75 1.75 0 0118 18H5.5a1.75 1.75 0 01-1.75-1.75v-8.75z" />
                                </svg>
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 font-mono">
                                    Configuration
                                </h3>
                            </div>
                            <button
                                type="button"
                                disabled={isRunning}
                                onClick={handleClearForm}
                                className={`px-2.5 py-1 text-[10px] rounded-lg border font-semibold transition-all ${
                                    isRunning
                                        ? "bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-600 border-slate-200 dark:border-zinc-700 cursor-not-allowed"
                                        : "bg-red-50 hover:bg-red-100 border-red-200 text-red-600 cursor-pointer dark:bg-red-500/10 dark:hover:bg-red-500/15 dark:border-red-400/30 dark:text-red-300"
                                }`}>
                                Clear
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-2 sm:gap-4 items-center">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400 text-left">
                                Source Folder <span className="text-red-500">*</span>
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={sourcePath}
                                    onChange={(e) => setSourcePath(e.target.value)}
                                    placeholder="e.g., /path/to/source-code-folder"
                                    className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25 dark:bg-[#1b2029] dark:border-white/5 dark:text-zinc-100 dark:placeholder-zinc-500"
                                />
                                <button
                                    type="button"
                                    onClick={handleSelectSourcePath}
                                    title="Browse source folder"
                                    aria-label="Browse source folder"
                                    className="h-11 w-11 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-700 hover:border-[#7d6df7]/20 cursor-pointer dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-400 dark:hover:bg-[#232938] dark:hover:text-zinc-200">
                                    <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5A1.75 1.75 0 015.5 5.75h4l1.5 1.75h7a1.75 1.75 0 011.75 1.75v7A1.75 1.75 0 0118 18H5.5a1.75 1.75 0 01-1.75-1.75v-8.75z" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="px-6 flex justify-end">
                        <button
                            type="button"
                            disabled={isRunning}
                            onClick={() => runScan("full")}
                            className={`px-5 py-2.5 bg-[#7d6df7] text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-[#7d6df7]/25 flex items-center justify-center gap-2 ${
                                isRunning
                                    ? "opacity-50 cursor-not-allowed"
                                    : "hover:bg-[#9387ff] active:scale-[0.99] cursor-pointer"
                            }`}>
                            {isRunning && activeMode === "full" ? "Scanning..." : "Scan"}
                        </button>
                    </div>

                    {result && (
                        <div className="mx-6 rounded-2xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 p-4 space-y-4">
                            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                                <div className="flex flex-wrap items-center gap-3">
                                    <span className={`text-sm font-black uppercase tracking-[0.22em] ${healthScoreTone}`}>
                                        Health Score: {result.summary.healthScore}/100
                                    </span>
                                </div>

                                <div className="flex items-center gap-3">
                                    <span className={`text-xs font-mono px-2.5 py-1 rounded-full ${statusPillClassName}`}>
                                        {result.summary.status}
                                    </span>
                                    <span className="text-xs text-slate-500 dark:text-zinc-400 font-mono">
                                        {result.summary.totalFiles} files / {result.summary.totalIssues} issues
                                    </span>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-zinc-400 font-mono">
                                    Filters
                                </span>
                                {(Object.keys(FILTER_META) as CodeHealthFilter[]).map((filterKey) => {
                                    const active = activeFilter === filterKey;
                                    return (
                                        <button
                                            key={filterKey}
                                            type="button"
                                            onClick={() => setActiveFilter(filterKey)}
                                            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-all border ${
                                                active
                                                    ? "border-amber-400 shadow-sm"
                                                    : "border-transparent"
                                            } ${FILTER_META[filterKey].accent}`}>
                                            <span>{FILTER_META[filterKey].label}</span>
                                            <span>({filterCounts[filterKey]})</span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                                <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5">
                                    <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                                        TypeScript Errors
                                    </div>
                                    <div className="mt-1.5 text-xl font-bold text-fuchsia-700 dark:text-fuchsia-300">
                                        {result.summary.typescriptErrors}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5">
                                    <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                                        ESLint Errors
                                    </div>
                                    <div className="mt-1.5 text-xl font-bold text-rose-600 dark:text-rose-400">
                                        {result.summary.eslintErrors}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5">
                                    <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                                        ESLint Warnings
                                    </div>
                                    <div className="mt-1.5 text-xl font-bold text-amber-600 dark:text-amber-400">
                                        {filterCounts["eslint-warning"]}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5">
                                    <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                                        Nice To Have
                                    </div>
                                    <div className="mt-1.5 text-xl font-bold text-amber-700 dark:text-amber-300">
                                        {filterCounts["nice-to-have"]}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {result && (
                        <div className="px-6 space-y-6">
                            <div className="space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
                                            Main Issues
                                        </h3>
                                        <p className="text-xs text-slate-500 dark:text-zinc-400">
                                            Nhóm lỗi và warning chính nên ưu tiên đọc trước.
                                        </p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 gap-4">
                                    {renderFileList(primaryFiles, "Không có file nào khớp với filter hiện tại.")}
                                </div>
                            </div>

                            {niceToHaveFiles.length > 0 && (
                                <div className="space-y-3">
                                    <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/10 p-4">
                                        <h3 className="text-sm font-bold text-amber-800 dark:text-amber-300">
                                            Nice To Have
                                        </h3>
                                        <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-200/80">
                                            Các warning này thiên về readability và maintainability, có thể tập làm để improve quality của code.
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-1 gap-4">
                                        {renderFileList(niceToHaveFiles, "Không có warning nice to have nào.")}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
