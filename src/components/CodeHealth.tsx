import { useMemo, useState } from "react";
import { useStoredState } from "../hooks/useStoredState";

type CodeHealthMode = "full" | "eslint" | "knip";
type CodeHealthSource = "eslint" | "knip";
type CodeHealthSeverity = "error" | "warning";
type CodeHealthFilter = "all" | "knip" | "eslint-error" | "eslint-warning";

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
        knipOrphanFiles: number;
        knipUnusedExports: number;
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
    knip: {
        stdout: string;
        stderr: string;
        exitCode: number;
        orphanFiles: number;
        unusedExports: number;
        files: CodeHealthFileReport[];
    };
    files: CodeHealthFileReport[];
}

const FILTER_META: Record<CodeHealthFilter, { label: string; accent: string }> = {
    all: { label: "All", accent: "bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-200" },
    knip: { label: "Knip", accent: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" },
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

function getFileSignal(file: CodeHealthFileReport) {
    const hasKnipIssue = file.issues.some((issue) => issue.source === "knip");
    const hasError = file.issues.some((issue) => issue.severity === "error");

    if (hasKnipIssue || hasError) {
        return {
            icon: "🔴",
            className: "text-rose-600 dark:text-rose-400",
        };
    }

    return {
        icon: "🟡",
        className: "text-amber-600 dark:text-amber-400",
    };
}

function formatCountBadge(label: string, count: number, tone: string) {
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>
            {label} {count}
        </span>
    );
}

export default function CodeHealth() {
    const [sourcePath, setSourcePath] = useStoredState<string>("code-health-source-path", "");
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
            setStatus({ type: "error", message: "Vui long chon Source Code Folder!" });
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
                setStatus({ type: "success", message: "Code Health scan thanh cong, khong co van de!" });
            } else if (res.summary.status === "issues") {
                setStatus({ type: null, message: "" });
            } else {
                setStatus({ type: "error", message: "Code Health gap loi khi chay scan." });
            }
        } catch {
            setStatus({ type: "error", message: "Loi khi chay Code Health. Kiem tra lai duong dan source." });
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
                message: response.error || "Khong mo duoc file trong VS Code.",
            });
        }
    };

    const filteredFiles = useMemo(() => {
        if (!result) return [];

        return result.files.filter((file) => {
            if (activeFilter === "all") {
                return true;
            }

            if (activeFilter === "knip") {
                return file.issues.some((issue) => issue.source === "knip");
            }

            if (activeFilter === "eslint-error") {
                return file.issues.some((issue) => issue.source === "eslint" && issue.severity === "error");
            }

            return file.issues.some((issue) => issue.source === "eslint" && issue.severity === "warning");
        });
    }, [activeFilter, result]);

    const filterCounts = useMemo(() => {
        if (!result) {
            return {
                all: 0,
                knip: 0,
                "eslint-error": 0,
                "eslint-warning": 0,
            };
        }

        return {
            all: result.files.length,
            knip: result.files.filter((file) => file.issues.some((issue) => issue.source === "knip")).length,
            "eslint-error": result.files.filter((file) => file.issues.some((issue) => issue.source === "eslint" && issue.severity === "error")).length,
            "eslint-warning": result.files.filter((file) => file.issues.some((issue) => issue.source === "eslint" && issue.severity === "warning")).length,
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

    return (
        <div>
            <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 dark:border-zinc-700 pb-4">
                <div className="text-left">
                    <h2 className="text-2xl font-bold text-amber-500 mb-1">
                        Code Health
                    </h2>
                    <p className="text-slate-500 dark:text-zinc-400 text-xs">
                        Gom bao cao ESLint va Knip theo tung file de dev sua nhanh hon
                    </p>
                </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 p-6 rounded-2xl shadow-sm min-h-[400px]">
                <div className="space-y-6">
                    {status.type && (
                        <div
                            className={`p-4 rounded-xl border text-sm font-medium transition-all ${
                                status.type === "success"
                                    ? "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-400"
                                    : "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700 text-red-800 dark:text-red-400"
                            }`}>
                            {status.message}
                        </div>
                    )}

                    <div className="bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 p-5 rounded-2xl space-y-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-zinc-600 pb-2.5 mb-2">
                            <div className="flex items-center gap-2">
                                <span className="text-sm">📁</span>
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
                                        : "bg-transparent hover:bg-amber-50 dark:hover:bg-amber-950/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 cursor-pointer"
                                }`}>
                                Clear
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 items-center">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400 text-left">
                                Source Folder <span className="text-red-500">*</span>
                            </label>
                            <div className="sm:col-span-2 flex gap-2">
                                <input
                                    type="text"
                                    value={sourcePath}
                                    onChange={(e) => setSourcePath(e.target.value)}
                                    placeholder="e.g., /path/to/source-code-folder"
                                    className="flex-1 px-4 py-3 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-600 rounded-xl text-slate-800 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20"
                                />
                                <button
                                    type="button"
                                    onClick={handleSelectSourcePath}
                                    className="px-3 py-2 bg-slate-100 dark:bg-zinc-700 hover:bg-slate-200 dark:hover:bg-zinc-600 border border-slate-200 dark:border-zinc-600 text-slate-700 dark:text-zinc-300 font-bold text-xs rounded-xl transition-all cursor-pointer">
                                    Browse
                                </button>
                            </div>
                        </div>
                    </div>

                    {result && (
                        <div className="rounded-2xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 p-4 space-y-4">
                            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                                <div className="flex flex-wrap items-center gap-3">
                                    <button
                                        type="button"
                                        disabled={isRunning}
                                        onClick={() => runScan("full")}
                                        className={`px-5 py-2.5 bg-teal-600 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-teal-500/10 flex items-center justify-center gap-2 ${
                                            isRunning
                                                ? "opacity-50 cursor-not-allowed"
                                                : "hover:bg-teal-500 active:scale-[0.99] cursor-pointer"
                                        }`}>
                                        {isRunning && activeMode === "full" ? "Running Health Check..." : "⚡ Run Health Check"}
                                    </button>
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

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3">
                                    <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                                        ESLint Errors
                                    </div>
                                    <div className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-400">
                                        {result.summary.eslintErrors}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3">
                                    <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                                        ESLint Warnings
                                    </div>
                                    <div className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">
                                        {result.summary.eslintWarnings}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3">
                                    <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                                        Knip Orphan Files
                                    </div>
                                    <div className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-400">
                                        {result.summary.knipOrphanFiles}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3">
                                    <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                                        Knip Unused Exports
                                    </div>
                                    <div className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-400">
                                        {result.summary.knipUnusedExports}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {!result && (
                        <div className="flex justify-end">
                            <button
                                type="button"
                                disabled={isRunning}
                                onClick={() => runScan("full")}
                                className={`px-5 py-2.5 bg-teal-600 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-teal-500/10 flex items-center justify-center gap-2 ${
                                    isRunning
                                        ? "opacity-50 cursor-not-allowed"
                                        : "hover:bg-teal-500 active:scale-[0.99] cursor-pointer"
                                }`}>
                                {isRunning && activeMode === "full" ? "Running Health Check..." : "Run Health Check"}
                            </button>
                        </div>
                    )}

                    {result && (
                        <div className="grid grid-cols-1 gap-4">
                            {filteredFiles.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-slate-300 dark:border-zinc-700 p-8 text-center text-sm text-slate-500 dark:text-zinc-400">
                                    Khong co file nao khop voi filter hien tai.
                                </div>
                            ) : (
                                filteredFiles.map((file) => {
                                    const signal = getFileSignal(file);
                                    const isExpanded = Boolean(expandedFiles[file.filePath]);
                                    const knipCount = file.issues.filter((issue) => issue.source === "knip").length;
                                    const eslintErrorCount = file.issues.filter((issue) => issue.source === "eslint" && issue.severity === "error").length;
                                    const eslintWarningCount = file.issues.filter((issue) => issue.source === "eslint" && issue.severity === "warning").length;

                                    return (
                                        <div
                                            key={file.filePath}
                                            className="rounded-2xl border border-slate-200 dark:border-zinc-700 overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
                                            <button
                                                type="button"
                                                onClick={() => toggleExpanded(file.filePath)}
                                                className="w-full px-4 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-slate-50 dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-750 transition-all text-left">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <span className="text-base">{isExpanded ? "🔽" : "▶️"}</span>
                                                    <span className={`text-base ${signal.className}`}>{signal.icon}</span>
                                                    <span className="font-semibold text-slate-800 dark:text-zinc-100 break-all">
                                                        {file.filePath}
                                                    </span>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-2">
                                                    {file.errorCount > 0 && formatCountBadge("🔴", file.errorCount, "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300")}
                                                    {file.warningCount > 0 && formatCountBadge("🟡", file.warningCount, "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300")}
                                                    {knipCount > 0 && formatCountBadge("Knip", knipCount, "bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-300")}
                                                    {eslintErrorCount > 0 && formatCountBadge("ESLint Error", eslintErrorCount, "bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-300")}
                                                    {eslintWarningCount > 0 && formatCountBadge("ESLint Warn", eslintWarningCount, "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300")}
                                                </div>
                                            </button>

                                            {isExpanded && (
                                                <div className="overflow-x-auto">
                                                    <table className="min-w-full text-sm">
                                                        <thead className="bg-slate-100 dark:bg-zinc-900 border-y border-slate-200 dark:border-zinc-700">
                                                            <tr className="text-left text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-zinc-400">
                                                                <th className="px-4 py-3 font-mono">Source</th>
                                                                <th className="px-4 py-3 font-mono">Location</th>
                                                                <th className="px-4 py-3 font-mono">Message</th>
                                                                <th className="px-4 py-3 font-mono">Rule ID</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {file.issues.map((issue, index) => (
                                                                <tr
                                                                    key={`${file.filePath}-${issue.ruleId}-${index}`}
                                                                    className="border-b border-slate-200 dark:border-zinc-800 last:border-0 align-top">
                                                                    <td className="px-4 py-3">
                                                                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                                                            issue.source === "knip"
                                                                                ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                                                                                : issue.severity === "error"
                                                                                    ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                                                                                    : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                                                                        }`}>
                                                                            {issue.source === "knip" ? "Knip" : "ESLint"}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-4 py-3 text-slate-600 dark:text-zinc-300 font-mono whitespace-nowrap">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => void handleOpenInVSCode(file, issue)}
                                                                            className="text-left text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 hover:underline cursor-pointer">
                                                                            {issue.location.label}
                                                                        </button>
                                                                    </td>
                                                                    <td className="px-4 py-3 text-slate-800 dark:text-zinc-100">
                                                                        {issue.message}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-slate-500 dark:text-zinc-400 font-mono break-all">
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
                                })
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
