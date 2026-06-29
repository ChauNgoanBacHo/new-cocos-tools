import { useState, useMemo } from "react";
import { useStoredState } from "../hooks/useStoredState";
import { SPINE_ALIASES_STORAGE_KEY, type PathAlias } from "../constants/spineAliases";

interface SpineSummaryEntry {
    spine: string;
    unusedAnims: string[];
}

interface CheckResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    spineSummary: SpineSummaryEntry[];
}

interface ParsedSection {
    title: string;
    lines: string[];
}

function parseSections(output: string): ParsedSection[] {
    return output.split("\n").reduce<ParsedSection[]>((acc, line) => {
        if (line.startsWith("---")) {
            acc.push({ title: line.replace(/---/g, "").trim(), lines: [] });
        } else if (line.trim() && acc.length > 0) {
            acc[acc.length - 1].lines.push(line);
        }
        return acc;
    }, []);
}

export default function CheckConfigs() {
    const [configPath, setConfigPath] = useStoredState<string>("check-config-path", "");
    const [sourcePath, setSourcePath] = useStoredState<string>("check-source-path", "");
    const [aliases] = useStoredState<PathAlias[]>(SPINE_ALIASES_STORAGE_KEY, []);
    const [isRunning, setIsRunning] = useState(false);
    const [result, setResult] = useState<CheckResult | null>(null);
    const [status, setStatus] = useState<{ type: "success" | "error" | null; message: string }>({
        type: null,
        message: "",
    });
    const [selectedSourceAliasId, setSelectedSourceAliasId] = useState("");
    const [copied, setCopied] = useState(false);
    const sortedAliases = [...aliases].sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" }),
    );

    const sections = useMemo(
        () => (result ? parseSections(result.stdout || result.stderr || "No output") : []),
        [result],
    );

    const summary = useMemo(() => result?.spineSummary ?? [], [result]);

    const handleCopySummary = async () => {
        if (summary.length === 0) return;
        const text = summary
            .map((entry) => `${entry.spine}\n${entry.unusedAnims.map((anim) => `  - ${anim}`).join("\n")}`)
            .join("\n\n");
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
        }
    };

    const handleSelectConfigFile = async () => {
        const file = await window.electronAPI.selectFile();
        if (file) setConfigPath(file);
    };

    const handleSelectSourcePath = async () => {
        const folder = await window.electronAPI.selectFolder();
        if (folder) setSourcePath(folder);
    };

    const handleRunCheck = async () => {
        if (!configPath.trim()) {
            setStatus({ type: "error", message: "Vui lòng chọn file config!" });
            return;
        }
        if (!sourcePath.trim()) {
            setStatus({ type: "error", message: "Vui lòng chọn source folder!" });
            return;
        }

        setIsRunning(true);
        setResult(null);
        setStatus({ type: null, message: "" });

        try {
            const res: CheckResult = await window.electronAPI.checkConfig(configPath, sourcePath);
            setResult(res);
            if (res.exitCode === 0) {
                setStatus({ type: "success", message: "Tất cả config keys đều được sử dụng!" });
            } else {
                setStatus({ type: "error", message: "Phát hiện config keys không được sử dụng." });
            }
        } catch {
            setStatus({ type: "error", message: "Lỗi khi kiểm tra config. Kiểm tra lại đường dẫn." });
        } finally {
            setIsRunning(false);
        }
    };

    const handleClearForm = () => {
        setConfigPath("");
        setSourcePath("");
        setSelectedSourceAliasId("");
        setResult(null);
        setStatus({ type: null, message: "" });
    };

    const handleUseSourceAlias = (alias: PathAlias) => {
        setSelectedSourceAliasId(alias.id);
        setSourcePath(alias.path);
        setStatus({
            type: "success",
            message: `Đã chọn source alias "${alias.name}".`,
        });
    };

    return (
        <div>
            <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 dark:border-zinc-700 pb-4">
                <div className="text-left">
                    <h2 className="text-2xl font-bold text-[#9b8cff] mb-1">
                        Usage Check
                    </h2>
                    <p className="text-slate-500 dark:text-zinc-400 text-xs">
                        Kiểm tra config keys có được sử dụng trong source code
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
                                Config File <span className="text-red-500">*</span>
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={configPath}
                                    onChange={(e) => setConfigPath(e.target.value)}
                                    placeholder="e.g., /path/to/SoundConfig9704.ts"
                                    className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25 dark:bg-[#1b2029] dark:border-white/5 dark:text-zinc-100 dark:placeholder-zinc-500"
                                />
                                <button
                                    type="button"
                                    onClick={handleSelectConfigFile}
                                    title="Browse config file"
                                    aria-label="Browse config file"
                                    className="h-11 w-11 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-700 hover:border-[#7d6df7]/20 cursor-pointer dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-400 dark:hover:bg-[#232938] dark:hover:text-zinc-200">
                                    <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5A1.75 1.75 0 015.5 5.75h4l1.5 1.75h7a1.75 1.75 0 011.75 1.75v7A1.75 1.75 0 0118 18H5.5a1.75 1.75 0 01-1.75-1.75v-8.75z" />
                                    </svg>
                                </button>
                            </div>
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
                                    placeholder="e.g., /path/to/scripts"
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

                        <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-2 sm:gap-4 items-center">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400 text-left">
                                Alias
                            </label>
                            <div className="min-w-0 space-y-2">
                                {sortedAliases.length > 0 ? (
                                    <div className="flex min-w-0 gap-2">
                                        <select
                                            value={selectedSourceAliasId}
                                            onChange={(event) => {
                                                setSelectedSourceAliasId(event.target.value);
                                                const alias = aliases.find((item) => item.id === event.target.value);
                                                if (alias) handleUseSourceAlias(alias);
                                            }}
                                            className="min-w-0 flex-1 truncate px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25 dark:bg-[#1b2029] dark:border-white/5 dark:text-zinc-100">
                                            <option value="">Select source alias...</option>
                                            {sortedAliases.map((alias) => (
                                                <option key={alias.id} value={alias.id}>
                                                    {alias.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-400">
                                        <span>Go to</span>
                                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-[#7d6df7]/25">
                                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                                                />
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                        </span>
                                        <span>to create shared path aliases.</span>
                                    </div>
                                )}
                                {selectedSourceAliasId && (
                                    <div className="truncate text-[11px] text-slate-500 dark:text-zinc-400">
                                        {sortedAliases.find((alias) => alias.id === selectedSourceAliasId)?.path}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="px-6 flex justify-end">
                        <button
                            type="button"
                            disabled={isRunning}
                            onClick={handleRunCheck}
                            className={`px-5 py-2.5 bg-[#7d6df7] text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-[#7d6df7]/25 flex items-center justify-center gap-2 ${
                                isRunning
                                    ? "opacity-50 cursor-not-allowed"
                                    : "hover:bg-[#9387ff] active:scale-[0.99] cursor-pointer"
                            }`}>
                            {isRunning ? (
                                <>
                                    <svg
                                        className="animate-spin h-3.5 w-3.5 text-white"
                                        fill="none"
                                        viewBox="0 0 24 24">
                                        <circle
                                            className="opacity-25"
                                            cx="12"
                                            cy="12"
                                            r="10"
                                            stroke="currentColor"
                                            strokeWidth="4"
                                        />
                                        <path
                                            className="opacity-75"
                                            fill="currentColor"
                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                        />
                                    </svg>
                                    <span>Checking...</span>
                                </>
                            ) : (
                                "Scan"
                            )}
                        </button>
                    </div>

                    {result && (
                        <div className="px-6 space-y-4 max-h-[500px] overflow-y-auto">
                            {summary.length > 0 && (
                                <div className="bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl overflow-hidden">
                                    <div className="flex items-center justify-between px-4 py-2.5 bg-slate-200 dark:bg-zinc-800 border-b border-slate-300 dark:border-zinc-700">
                                        <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 font-mono">
                                            Summary
                                        </span>
                                        <button
                                            type="button"
                                            onClick={handleCopySummary}
                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] rounded-lg border font-semibold transition-all cursor-pointer ${
                                                copied
                                                    ? "bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-500/10 dark:border-emerald-400/30 dark:text-emerald-300"
                                                    : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600 dark:bg-[#1b2029] dark:hover:bg-[#232938] dark:border-white/5 dark:text-zinc-300"
                                            }`}>
                                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                {copied ? (
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                ) : (
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7.5V6.75A2.25 2.25 0 0110.25 4.5h7A2.25 2.25 0 0119.5 6.75v7a2.25 2.25 0 01-2.25 2.25H16.5M6.75 9.5h7a2.25 2.25 0 012.25 2.25v7A2.25 2.25 0 0113.75 21h-7a2.25 2.25 0 01-2.25-2.25v-7A2.25 2.25 0 016.75 9.5z" />
                                                )}
                                            </svg>
                                            {copied ? "Copied" : "Copy"}
                                        </button>
                                    </div>
                                    <div className="p-4 text-sm font-mono text-left space-y-3">
                                        {summary.map((entry, i) => (
                                            <div key={i}>
                                                <div className="text-amber-600 dark:text-amber-400 font-bold">{entry.spine}</div>
                                                <div className="mt-1 pl-3 space-y-0.5">
                                                    {entry.unusedAnims.map((anim, j) => (
                                                        <div key={j} className="text-red-600 dark:text-red-400">- {anim}</div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {sections.map((section, i) => (
                                    <div key={i} className="bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl overflow-hidden">
                                        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-200 dark:bg-zinc-800 border-b border-slate-300 dark:border-zinc-700">
                                            <span className="text-xs font-mono text-amber-600 dark:text-amber-400 font-bold">{section.title}</span>
                                            <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                                                section.lines.some(l => l.includes("UNUSED:"))
                                                    ? "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400"
                                                    : "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400"
                                            }`}>
                                                {section.lines.filter(l => l.includes("UNUSED:")).length} unused
                                            </span>
                                        </div>
                                        <div className="p-4 text-sm font-mono text-left">
                                            {section.lines.map((line, j) => (
                                                <div key={j} className={`py-1 ${
                                                    line.includes("UNUSED:") ? "text-red-600 dark:text-red-400" :
                                                    line.includes("DYNAMIC:") ? "text-yellow-600 dark:text-yellow-400" :
                                                    "text-emerald-600 dark:text-emerald-400"
                                                }`}>
                                                    {line.trim()}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
