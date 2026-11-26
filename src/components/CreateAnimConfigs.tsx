import { useState } from "react";
import { useStoredState } from "../hooks/useStoredState";
import ActionPromptModal from "./ActionPromptModal";
import { DEFAULT_ANIM_EXCLUDE_LIST } from "../constants/generatorExcludes";
import { SPINE_ALIASES_STORAGE_KEY, type PathAlias } from "../constants/spineAliases";

interface AnimResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

interface CreateAnimConfigsProps {
    onOpenCodeHealth?: (sourcePath: string) => void;
}

function getCodeHealthScriptsPath(outputPath: string) {
    const normalizedPath = outputPath.replace(/\\/g, "/");
    const scriptsIndex = normalizedPath.lastIndexOf("/scripts");

    if (scriptsIndex === -1) {
        return outputPath;
    }

    return normalizedPath.slice(0, scriptsIndex + "/scripts".length);
}

function parseAnimDetailLine(line: string) {
    const trimmed = line.trim();
    const separatorIndex = trimmed.indexOf(":");

    if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) {
        return null;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!key || !value) {
        return null;
    }

    return { key, value };
}

export default function CreateAnimConfigs({ onOpenCodeHealth }: CreateAnimConfigsProps) {
    const [spineDir, setSpineDir] = useStoredState<string>("anim-spine-dir", "");
    const [outputDir, setOutputDir] = useStoredState<string>("anim-output-dir", "");
    const [aliases] = useStoredState<PathAlias[]>(SPINE_ALIASES_STORAGE_KEY, []);
    const [animFileName, setAnimFileName] = useStoredState<string>("anim-file-name", "AnimConfig9000.ts");
    const [timeFileName, setTimeFileName] = useStoredState<string>("time-file-name", "TimeConfig9000.ts");
    const [overwrite, setOverwrite] = useStoredState<boolean>("anim-overwrite", false);
    const [clearFull, setClearFull] = useStoredState<boolean>("anim-clear-full", true);
    const [excludeList] = useStoredState<string[]>("anim-generator-exclude-list", DEFAULT_ANIM_EXCLUDE_LIST);
    const [isRunning, setIsRunning] = useState(false);
    const [result, setResult] = useState<AnimResult | null>(null);
    const [pendingCodeHealthPath, setPendingCodeHealthPath] = useState<string | null>(null);
    const [status, setStatus] = useState<{ type: "success" | "error" | null; message: string }>({
        type: null,
        message: "",
    });
    const [selectedSpineAliasId, setSelectedSpineAliasId] = useState("");
    const [selectedOutputAliasId, setSelectedOutputAliasId] = useState("");
    const sortedAliases = [...aliases].sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" }),
    );

    const handleSelectSpineDir = async () => {
        const folder = await window.electronAPI.selectFolder();
        if (folder) setSpineDir(folder);
    };

    const handleSelectOutputDir = async () => {
        const folder = await window.electronAPI.selectFolder();
        if (folder) setOutputDir(folder);
    };

    const handleRun = async () => {
        if (!spineDir.trim()) {
            setStatus({ type: "error", message: "Vui lòng chọn folder animation!" });
            return;
        }
        if (!outputDir.trim()) {
            setStatus({ type: "error", message: "Vui lòng chọn output folder!" });
            return;
        }

        setIsRunning(true);
        setResult(null);
        setStatus({ type: null, message: "" });

        try {
            const res: AnimResult = await window.electronAPI.createAnimConfig(
                spineDir, outputDir, animFileName, timeFileName, overwrite, clearFull, excludeList
            );
            setResult(res);
            if (res.exitCode === 0) {
                setStatus({ type: "success", message: overwrite ? "Quét và tạo file thành công!" : "Quét thành công (không ghi file)." });
                setPendingCodeHealthPath(getCodeHealthScriptsPath(outputDir));
            } else {
                setStatus({ type: "error", message: "Có lỗi xảy ra khi quét." });
            }
        } catch {
            setStatus({ type: "error", message: "Lỗi khi tạo config. Kiểm tra lại đường dẫn." });
        } finally {
            setIsRunning(false);
        }
    };

    const handleClearForm = () => {
        setSpineDir("");
        setOutputDir("");
        setSelectedSpineAliasId("");
        setSelectedOutputAliasId("");
        setAnimFileName("");
        setTimeFileName("");
        setOverwrite(false);
        setClearFull(true);
        setResult(null);
        setPendingCodeHealthPath(null);
        setStatus({ type: null, message: "" });
    };

    const handleUseSpineAlias = (alias: PathAlias) => {
        setSelectedSpineAliasId(alias.id);
        setSpineDir(alias.path);
        setStatus({
            type: "success",
            message: `Đã chọn spine alias "${alias.name}".`,
        });
    };

    const handleUseOutputAlias = (alias: PathAlias) => {
        setSelectedOutputAliasId(alias.id);
        setOutputDir(alias.path);
        setStatus({
            type: "success",
            message: `Đã chọn output alias "${alias.name}".`,
        });
    };

    return (
        <div className="sm:col-span-2">
            <ActionPromptModal
                open={Boolean(pendingCodeHealthPath)}
                title="Create Anim Config thành công"
                description="Bạn có muốn mở Code Health để scan source này ngay không?"
                confirmLabel="Mở Code Health"
                cancelLabel="Để sau"
                onConfirm={() => {
                    if (pendingCodeHealthPath) {
                        onOpenCodeHealth?.(pendingCodeHealthPath);
                    }
                    setPendingCodeHealthPath(null);
                }}
                onCancel={() => setPendingCodeHealthPath(null)}
            />

            <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 dark:border-zinc-700 pb-4">
                <div className="text-left">
                    <h2 className="text-2xl font-bold text-[#9b8cff] mb-1">
                        Anim Generator
                    </h2>
                    <p className="text-slate-500 dark:text-zinc-400 text-xs">
                        Quét Spine JSON và tạo AnimConfig + TimeConfig
                    </p>
                </div>
            </div>

            <div className="bg-white border border-slate-200 dark:bg-[#2b3140] dark:border-white/5 rounded-2xl shadow-[0_18px_36px_rgba(148,163,184,0.16)] dark:shadow-[0_18px_36px_rgba(10,12,18,0.28)] overflow-hidden">
                <div className="py-6 space-y-6">
                    {status.type && (
                        <div
                            className="px-6"
                        >
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
                        <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-white/5 pb-2.5 mb-2">
                            <div className="flex items-center gap-2">
                                <svg className="h-4 w-4 text-[#b7a8ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5A1.75 1.75 0 015.5 5.75h4l1.5 1.75h7a1.75 1.75 0 011.75 1.75v7A1.75 1.75 0 0118 18H5.5a1.75 1.75 0 01-1.75-1.75v-8.75z" />
                                </svg>
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-100 font-mono">
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
                            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 text-left">
                                Spine Folder <span className="text-red-500">*</span>
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={spineDir}
                                    onChange={(e) => setSpineDir(e.target.value)}
                                    placeholder="e.g., /path/to/Animation"
                                    className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25 dark:bg-[#1b2029] dark:border-white/5 dark:text-zinc-100 dark:placeholder-zinc-500"
                                />
                                <button
                                    type="button"
                                    onClick={handleSelectSpineDir}
                                    title="Browse spine folder"
                                    aria-label="Browse spine folder"
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
                                            value={selectedSpineAliasId}
                                            onChange={(event) => {
                                                setSelectedSpineAliasId(event.target.value);
                                                const alias = aliases.find((item) => item.id === event.target.value);
                                                if (alias) handleUseSpineAlias(alias);
                                            }}
                                            className="min-w-0 flex-1 truncate px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25 dark:bg-[#1b2029] dark:border-white/5 dark:text-zinc-100">
                                            <option value="">Select spine alias...</option>
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
                                {selectedSpineAliasId && (
                                    <div className="truncate text-[11px] text-slate-500 dark:text-zinc-400">
                                        {sortedAliases.find((alias) => alias.id === selectedSpineAliasId)?.path}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-2 sm:gap-4 items-center">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400 text-left">
                                Output Folder <span className="text-red-500">*</span>
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={outputDir}
                                    onChange={(e) => setOutputDir(e.target.value)}
                                    placeholder="e.g., /path/to/scripts/DataConfig"
                                    className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25 dark:bg-[#1b2029] dark:border-white/5 dark:text-zinc-100 dark:placeholder-zinc-500"
                                />
                                <button
                                    type="button"
                                    onClick={handleSelectOutputDir}
                                    title="Browse output folder"
                                    aria-label="Browse output folder"
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
                                            value={selectedOutputAliasId}
                                            onChange={(event) => {
                                                setSelectedOutputAliasId(event.target.value);
                                                const alias = aliases.find((item) => item.id === event.target.value);
                                                if (alias) handleUseOutputAlias(alias);
                                            }}
                                            className="min-w-0 flex-1 truncate px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25 dark:bg-[#1b2029] dark:border-white/5 dark:text-zinc-100">
                                            <option value="">Select output alias...</option>
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
                                {selectedOutputAliasId && (
                                    <div className="truncate text-[11px] text-slate-500 dark:text-zinc-400">
                                        {sortedAliases.find((alias) => alias.id === selectedOutputAliasId)?.path}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-2 sm:gap-4 items-center">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400 text-left">
                                Anim File Name
                            </label>
                            <div>
                                <input
                                    type="text"
                                    placeholder="AnimConfig9000.ts"
                                    value={animFileName}
                                    onChange={(e) => setAnimFileName(e.target.value)}
                                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25 dark:bg-[#1b2029] dark:border-white/5 dark:text-zinc-100 dark:placeholder-zinc-500"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-2 sm:gap-4 items-center">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400 text-left">
                                Time File Name
                            </label>
                            <div>
                                <input
                                    type="text"
                                    placeholder="TimeConfig9000.ts"
                                    value={timeFileName}
                                    onChange={(e) => setTimeFileName(e.target.value)}
                                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25 dark:bg-[#1b2029] dark:border-white/5 dark:text-zinc-100 dark:placeholder-zinc-500"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-2 sm:gap-4 items-center">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400 text-left">
                                Overwrite Files
                            </label>
                            <div className="text-left">
                                <label className="inline-flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={overwrite}
                                        onChange={(e) => setOverwrite(e.target.checked)}
                                        className="w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                                    />
                                    <span className="text-sm text-slate-600 dark:text-zinc-400">
                                        {overwrite ? "Sẽ ghi đè file nếu đã tồn tại" : "Chỉ quét, không ghi file"}
                                    </span>
                                </label>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-2 sm:gap-4 items-center">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400 text-left">
                                Clear Full
                            </label>
                            <div className="text-left">
                                <label className={`inline-flex items-center gap-2 ${overwrite ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
                                    <input
                                        type="checkbox"
                                        checked={clearFull}
                                        disabled={!overwrite}
                                        onChange={(e) => setClearFull(e.target.checked)}
                                        className="w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 disabled:cursor-not-allowed"
                                    />
                                    <span className="text-sm text-slate-600 dark:text-zinc-400">
                                        {clearFull ? "Tạo lại sạch, không giữ customize biến" : "Giữ lại customize biến chưa scan ra"}
                                    </span>
                                </label>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-2 sm:gap-4 items-start">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400 text-left pt-1">
                                Exclude List
                            </label>
                            <div className="min-w-0 space-y-2 text-left">
                                {excludeList.length > 0 && (
                                    <ul aria-label="Active exclude keys" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                                        {excludeList.map((key, index) => (
                                            <li
                                                key={`${key}-${index}`}
                                                className="max-w-full break-all rounded border border-slate-200 bg-slate-100/70 px-2 py-1 font-mono text-[11px] leading-4 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                                                {key}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                <div className="flex flex-wrap items-center gap-1.5 text-xs leading-6 text-amber-700 dark:text-amber-300/90">
                                    <span>
                                        {excludeList.length > 0
                                            ? `${excludeList.length} exclude keys are active. Go to`
                                            : "No exclude key is active. Go to"}
                                    </span>
                                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-amber-300/70 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300">
                                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                                            />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    </span>
                                    <span>
                                        {excludeList.length > 0
                                            ? "Settings > Generator Exclude List to add or remove items."
                                            : "Settings > Generator Exclude List to define one."}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="px-6 flex justify-end">
                        <button
                            type="button"
                            disabled={isRunning}
                            onClick={handleRun}
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
                                    <span>Scanning...</span>
                                </>
                            ) : (
                                "Create"
                            )}
                        </button>
                    </div>

                    {result && (
                        <div className="px-6 space-y-4 max-h-[500px] overflow-y-auto">
                            {(result.stdout || result.stderr || "No output")
                                .split("\n")
                                .reduce<{ title: string; lines: string[] }[]>((acc, line) => {
                                    if (line.startsWith("---")) {
                                        acc.push({ title: line.replace(/---/g, "").trim(), lines: [] });
                                    } else if (line.trim() && acc.length > 0) {
                                        acc[acc.length - 1].lines.push(line);
                                    } else if (line.trim() && acc.length === 0) {
                                        if (!acc.find(s => s.title === "Status")) {
                                            acc.push({ title: "Status", lines: [] });
                                        }
                                        acc[acc.length - 1].lines.push(line);
                                    }
                                    return acc;
                                }, [])
                                .map((section, i) => {
                                    const isErrorSection = section.title === "Validation Summary"
                                        || section.lines.some((line) => line.includes("ERROR:") || line.includes("Animation name contains whitespace"));

                                    return (
                                    <div
                                        key={i}
                                        className={`rounded-2xl overflow-hidden border ${
                                            isErrorSection
                                                ? "bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-400/30"
                                                : "bg-slate-100 dark:bg-zinc-900 border-slate-200 dark:border-zinc-700"
                                        }`}>
                                        <div className={`flex items-center justify-between px-4 py-2.5 border-b ${
                                            isErrorSection
                                                ? "bg-red-100 border-red-200 dark:bg-red-500/15 dark:border-red-400/30"
                                                : "bg-slate-200 dark:bg-zinc-800 border-slate-300 dark:border-zinc-700"
                                        }`}>
                                            <span className={`text-xs font-mono font-bold ${
                                                isErrorSection
                                                    ? "text-red-700 dark:text-red-200"
                                                    : "text-cyan-600 dark:text-cyan-400"
                                            }`}>{section.title}</span>
                                        </div>
                                        <div className="p-4 text-sm font-mono text-left">
                                            {(() => {
                                                const parsedLines = section.lines.map((line) => ({
                                                    raw: line,
                                                    detail: parseAnimDetailLine(line),
                                                }));
                                                const detailLines = parsedLines.filter((item) => item.detail);
                                                const plainLines = parsedLines.filter((item) => !item.detail);

                                                return (
                                                    <div className="space-y-3">
                                                        {detailLines.length > 0 && (
                                                            <div className="divide-y divide-slate-200 dark:divide-white/5">
                                                                {detailLines.map((item, j) => (
                                                                    <div
                                                                        key={`detail-${j}`}
                                                                        className="flex items-center gap-3 py-2"
                                                                    >
                                                                        <div className="w-[150px] shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">
                                                                            {item.detail?.key}
                                                                        </div>
                                                                        <div className="min-w-0 flex-1 text-sm font-semibold text-slate-800 dark:text-zinc-100">
                                                                            {item.detail?.value}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {plainLines.length > 0 && (
                                                            <div>
                                                                {plainLines.map((item, j) => (
                                                                    <div key={`plain-${j}`} className={`py-1 ${
                                                                        item.raw.includes("ERROR:") || item.raw.includes("Animation name contains whitespace") ? "font-semibold text-red-700 dark:text-red-200" :
                                                                        item.raw.includes("Generated:") ? "text-emerald-600 dark:text-emerald-400" :
                                                                        item.raw.includes("not written") ? "text-yellow-600 dark:text-yellow-400" :
                                                                        isErrorSection ? "text-red-700 dark:text-red-200" : "text-slate-700 dark:text-zinc-200"
                                                                    }`}>
                                                                        {item.raw.trim()}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                    );
                                })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
