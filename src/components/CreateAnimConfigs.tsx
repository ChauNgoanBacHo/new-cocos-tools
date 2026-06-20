import { useState } from "react";
import { useStoredState } from "../hooks/useStoredState";

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

export default function CreateAnimConfigs({ onOpenCodeHealth }: CreateAnimConfigsProps) {
    const [spineDir, setSpineDir] = useStoredState<string>("anim-spine-dir", "");
    const [outputDir, setOutputDir] = useStoredState<string>("anim-output-dir", "");
    const [animFileName, setAnimFileName] = useStoredState<string>("anim-file-name", "AnimConfig9000.ts");
    const [timeFileName, setTimeFileName] = useStoredState<string>("time-file-name", "TimeConfig9000.ts");
    const [overwrite, setOverwrite] = useStoredState<boolean>("anim-overwrite", false);
    const [isRunning, setIsRunning] = useState(false);
    const [result, setResult] = useState<AnimResult | null>(null);
    const [status, setStatus] = useState<{ type: "success" | "error" | null; message: string }>({
        type: null,
        message: "",
    });

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
                spineDir, outputDir, animFileName, timeFileName, overwrite
            );
            setResult(res);
            if (res.exitCode === 0) {
                setStatus({ type: "success", message: overwrite ? "Quét và tạo file thành công!" : "Quét thành công (không ghi file)." });

                const shouldOpenCodeHealth = window.confirm(
                    "Create Anim Config thành công. Bạn có muốn mở Code Health để scan source này ngay không?",
                );

                if (shouldOpenCodeHealth) {
                    onOpenCodeHealth?.(getCodeHealthScriptsPath(outputDir));
                }
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
        setAnimFileName("");
        setTimeFileName("");
        setOverwrite(false);
        setResult(null);
        setStatus({ type: null, message: "" });
    };

    return (
        <div className="sm:col-span-2">
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

            <div className="bg-[#2b3140] border border-white/5 rounded-2xl shadow-[0_18px_36px_rgba(10,12,18,0.28)] overflow-hidden">
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
                        <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-2.5 mb-2">
                            <div className="flex items-center gap-2">
                                <span className="text-sm">📁</span>
                                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-100 font-mono">
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
                                        : "bg-transparent hover:bg-[#7d6df7]/10 border-[#7d6df7]/35 text-[#b7a8ff] cursor-pointer"
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
                                    className="flex-1 px-4 py-3 bg-[#1b2029] border border-white/5 rounded-xl text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25"
                                />
                                <button
                                    type="button"
                                    onClick={handleSelectSpineDir}
                                    title="Browse spine folder"
                                    aria-label="Browse spine folder"
                                    className="h-11 w-11 inline-flex items-center justify-center rounded-xl border border-white/5 bg-[#1b2029] text-zinc-400 transition-all hover:bg-[#232938] hover:text-zinc-200 hover:border-[#7d6df7]/20 cursor-pointer">
                                    <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5A1.75 1.75 0 015.5 5.75h4l1.5 1.75h7a1.75 1.75 0 011.75 1.75v7A1.75 1.75 0 0118 18H5.5a1.75 1.75 0 01-1.75-1.75v-8.75z" />
                                    </svg>
                                </button>
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
                                    className="flex-1 px-4 py-3 bg-[#1b2029] border border-white/5 rounded-xl text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25"
                                />
                                <button
                                    type="button"
                                    onClick={handleSelectOutputDir}
                                    title="Browse output folder"
                                    aria-label="Browse output folder"
                                    className="h-11 w-11 inline-flex items-center justify-center rounded-xl border border-white/5 bg-[#1b2029] text-zinc-400 transition-all hover:bg-[#232938] hover:text-zinc-200 hover:border-[#7d6df7]/20 cursor-pointer">
                                    <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5A1.75 1.75 0 015.5 5.75h4l1.5 1.75h7a1.75 1.75 0 011.75 1.75v7A1.75 1.75 0 0118 18H5.5a1.75 1.75 0 01-1.75-1.75v-8.75z" />
                                    </svg>
                                </button>
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
                                    className="w-full px-4 py-3 bg-[#1b2029] border border-white/5 rounded-xl text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25"
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
                                    className="w-full px-4 py-3 bg-[#1b2029] border border-white/5 rounded-xl text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25"
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
                                .map((section, i) => (
                                    <div key={i} className="bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl overflow-hidden">
                                        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-200 dark:bg-zinc-800 border-b border-slate-300 dark:border-zinc-700">
                                            <span className="text-xs font-mono text-cyan-600 dark:text-cyan-400 font-bold">{section.title}</span>
                                        </div>
                                        <div className="p-4 text-sm font-mono text-left">
                                            {section.lines.map((line, j) => (
                                                <div key={j} className={`py-1 ${
                                                    line.includes("ERROR:") ? "text-red-600 dark:text-red-400" :
                                                    line.includes("Generated:") ? "text-emerald-600 dark:text-emerald-400" :
                                                    line.includes("not written") ? "text-yellow-600 dark:text-yellow-400" :
                                                    "text-slate-700 dark:text-zinc-200"
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
