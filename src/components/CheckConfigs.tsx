import { useState, useEffect } from "react";

interface CheckResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

export default function CheckConfigs() {
    const [configPath, setConfigPath] = useState<string>(() => {
        return localStorage.getItem("check-config-path") || "";
    });
    const [sourcePath, setSourcePath] = useState<string>(() => {
        return localStorage.getItem("check-source-path") || "";
    });
    const [isRunning, setIsRunning] = useState(false);
    const [result, setResult] = useState<CheckResult | null>(null);
    const [status, setStatus] = useState<{ type: "success" | "error" | null; message: string }>({
        type: null,
        message: "",
    });

    useEffect(() => {
        localStorage.setItem("check-config-path", configPath);
    }, [configPath]);

    useEffect(() => {
        localStorage.setItem("check-source-path", sourcePath);
    }, [sourcePath]);

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
        setResult(null);
        setStatus({ type: null, message: "" });
    };

    return (
        <div>
            <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 dark:border-zinc-700 pb-4">
                <div className="text-left">
                    <h2 className="text-2xl font-bold text-amber-500 mb-1">
                        Check Configs
                    </h2>
                    <p className="text-slate-500 dark:text-zinc-400 text-xs">
                        Kiểm tra config keys có được sử dụng trong source code
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
                                Config File <span className="text-red-500">*</span>
                            </label>
                            <div className="sm:col-span-2 flex gap-2">
                                <input
                                    type="text"
                                    value={configPath}
                                    onChange={(e) => setConfigPath(e.target.value)}
                                    placeholder="e.g., /path/to/SoundConfig9704.ts"
                                    className="flex-1 px-4 py-3 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-600 rounded-xl text-slate-800 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20"
                                />
                                <button
                                    type="button"
                                    onClick={handleSelectConfigFile}
                                    className="px-3 py-2 bg-slate-100 dark:bg-zinc-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-zinc-600 text-slate-700 dark:text-zinc-300 font-bold text-xs rounded-xl transition-all cursor-pointer">
                                    Browse
                                </button>
                            </div>
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
                                    placeholder="e.g., /path/to/scripts"
                                    className="flex-1 px-4 py-3 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-600 rounded-xl text-slate-800 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20"
                                />
                                <button
                                    type="button"
                                    onClick={handleSelectSourcePath}
                                    className="px-3 py-2 bg-slate-100 dark:bg-zinc-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-zinc-600 text-slate-700 dark:text-zinc-300 font-bold text-xs rounded-xl transition-all cursor-pointer">
                                    Browse
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <button
                            type="button"
                            disabled={isRunning}
                            onClick={handleRunCheck}
                            className={`px-5 py-2.5 bg-teal-600 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-teal-500/10 flex items-center justify-center gap-2 ${
                                isRunning
                                    ? "opacity-50 cursor-not-allowed"
                                    : "hover:bg-teal-500 active:scale-[0.99] cursor-pointer"
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
                                "Run"
                            )}
                        </button>
                    </div>

                    {result && (
                        <div className="space-y-4 max-h-[500px] overflow-y-auto">
                            {(result.stdout || result.stderr || "No output")
                                .split("\n")
                                .reduce<{ title: string; lines: string[] }[]>((acc, line) => {
                                    if (line.startsWith("---")) {
                                        acc.push({ title: line.replace(/---/g, "").trim(), lines: [] });
                                    } else if (line.trim() && acc.length > 0) {
                                        acc[acc.length - 1].lines.push(line);
                                    }
                                    return acc;
                                }, [])
                                .map((section, i) => (
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
