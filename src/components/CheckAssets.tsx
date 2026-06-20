import { useState } from "react";
import { useStoredState } from "../hooks/useStoredState";

interface UnusedEntry {
    label: string;
    detail?: string;
    files: string[];
}

interface AssetSection {
    key: string;
    title: string;
    found: number;
    used: number;
    skipped: string[];
    unused: UnusedEntry[];
}

export default function CheckAssets() {
    const [sourceDir, setSourceDir] = useStoredState<string>("check-assets-dir", "");
    const [isRunning, setIsRunning] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    const [sections, setSections] = useState<AssetSection[]>([]);
    const [status, setStatus] = useState<{ type: "success" | "error" | null; message: string }>({
        type: null,
        message: "",
    });

    const totalUnused = sections.reduce((sum, s) => sum + s.unused.length, 0);
    const totalUsed = sections.reduce((sum, s) => sum + s.used, 0);

    const handleSelectSourceDir = async () => {
        const folder = await window.electronAPI.selectFolder();
        if (folder) setSourceDir(folder);
    };

    const handleRun = async () => {
        if (!sourceDir.trim()) {
            setStatus({ type: "error", message: "Vui lòng chọn source folder!" });
            return;
        }

        setIsRunning(true);
        setSections([]);
        setStatus({ type: null, message: "" });

        try {
            const res = await window.electronAPI.checkAssets(sourceDir);
            if (res.exitCode === 0) {
                setSections(res.sections);
                setStatus({
                    type: "success",
                    message: `Quét hoàn tất: ${res.totalUsed} used, ${res.totalUnused} unused.`,
                });
            } else {
                setStatus({ type: "error", message: res.error || "Có lỗi xảy ra khi quét." });
            }
        } catch {
            setStatus({ type: "error", message: "Lỗi khi kiểm tra assets. Kiểm tra lại đường dẫn." });
        } finally {
            setIsRunning(false);
        }
    };

    const handleClearForm = () => {
        setSourceDir("");
        setSections([]);
        setStatus({ type: null, message: "" });
    };

    const deleteFiles = async (files: string[]): Promise<boolean> => {
        const res = await window.electronAPI.deleteAssets(sourceDir, files);
        if (res.exitCode !== 0 && res.failed.length > 0) {
            setStatus({
                type: "error",
                message: `Xoá ${res.deleted.length} files, lỗi ${res.failed.length} files: ${res.failed[0].error}`,
            });
            return false;
        }
        return true;
    };

    const handleClearSection = async (sectionKey: string) => {
        const section = sections.find(s => s.key === sectionKey);
        if (!section || section.unused.length === 0) return;

        const files = section.unused.flatMap(u => u.files);
        const confirmed = window.confirm(
            `Xoá ${section.unused.length} mục unused (${files.length} files) trong "${section.title}"?\n\nThao tác này không thể hoàn tác.`
        );
        if (!confirmed) return;

        setIsClearing(true);
        try {
            const ok = await deleteFiles(files);
            if (ok) {
                setStatus({ type: "success", message: `Đã xoá ${section.unused.length} mục unused trong ${section.title}.` });
            }
            setSections(prev => prev.map(s => s.key === sectionKey ? { ...s, unused: [] } : s));
        } catch {
            setStatus({ type: "error", message: "Lỗi khi xoá files." });
        } finally {
            setIsClearing(false);
        }
    };

    const busy = isRunning || isClearing;

    return (
        <div>
            <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 dark:border-zinc-700 pb-4">
                <div className="text-left">
                    <h2 className="text-2xl font-bold text-[#9b8cff] mb-1">
                        Asset Cleanup
                    </h2>
                    <p className="text-slate-500 dark:text-zinc-400 text-xs">
                        Quét asset/script unused trong project (không được ref trong .scene/.prefab)
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
                                disabled={busy}
                                onClick={handleClearForm}
                                className={`px-2.5 py-1 text-[10px] rounded-lg border font-semibold transition-all ${
                                    busy
                                        ? "bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-600 border-slate-200 dark:border-zinc-700 cursor-not-allowed"
                                        : "bg-red-500/10 hover:bg-red-500/15 border-red-400/30 text-red-300 cursor-pointer"
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
                                    value={sourceDir}
                                    onChange={(e) => setSourceDir(e.target.value)}
                                    placeholder="e.g., /path/to/project-root"
                                    className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25 dark:bg-[#1b2029] dark:border-white/5 dark:text-zinc-100 dark:placeholder-zinc-500"
                                />
                                <button
                                    type="button"
                                    onClick={handleSelectSourceDir}
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

                    <div className="px-6 flex justify-end gap-2">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={handleRun}
                            className={`px-5 py-2.5 bg-[#7d6df7] text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-[#7d6df7]/25 flex items-center justify-center gap-2 ${
                                busy
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
                                "Scan"
                            )}
                        </button>
                    </div>

                    {sections.length > 0 && (
                        <div className="px-6 space-y-4 max-h-[500px] overflow-y-auto">
                            <div className={`rounded-2xl overflow-hidden border ${
                                totalUnused > 0
                                    ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50"
                                    : "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50"
                            }`}>
                                <div className={`px-4 py-2.5 border-b ${
                                    totalUnused > 0
                                        ? "bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800/50"
                                        : "bg-emerald-100 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800/50"
                                }`}>
                                    <span className={`text-xs font-mono font-bold ${
                                        totalUnused > 0
                                            ? "text-amber-600 dark:text-amber-400"
                                            : "text-emerald-600 dark:text-emerald-400"
                                    }`}>Summary</span>
                                </div>
                                <div className={`p-4 text-sm font-mono text-left font-semibold ${
                                    totalUnused > 0
                                        ? "text-amber-700 dark:text-amber-300"
                                        : "text-emerald-700 dark:text-emerald-300"
                                }`}>
                                    {totalUnused > 0
                                        ? `${totalUsed} used, ${totalUnused} unused`
                                        : `${totalUsed} used, 0 unused`}
                                </div>
                            </div>

                            {sections.map((section) => (
                                <div key={section.key} className="rounded-2xl overflow-hidden bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700">
                                    <div className="flex items-center justify-between px-4 py-2.5 bg-slate-200 dark:bg-zinc-800 border-b border-slate-300 dark:border-zinc-700">
                                        <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                                            {section.title}
                                            <span className="ml-2 text-slate-500 dark:text-zinc-500 font-normal">
                                                ({section.found} found · {section.used} used · {section.unused.length} unused)
                                            </span>
                                        </span>
                                        {section.unused.length > 0 && (
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => handleClearSection(section.key)}
                                                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all ${
                                                    busy
                                                        ? "bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-600 border-slate-200 dark:border-zinc-700 cursor-not-allowed"
                                                        : "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/50 hover:bg-red-100 dark:hover:bg-red-900/40 cursor-pointer"
                                                }`}>
                                                🗑 Clear ({section.unused.length})
                                            </button>
                                        )}
                                    </div>
                                    <div className="p-4 text-sm font-mono text-left">
                                        {section.unused.length === 0 && section.skipped.length === 0 ? (
                                            <div className="py-1 text-slate-400 dark:text-zinc-600">No unused items</div>
                                        ) : (
                                            <>
                                                {section.unused.map((entry, j) => (
                                                    <div key={`u-${j}`} className="py-1">
                                                        <div className={
                                                            entry.label.includes("[Font]") ? "text-amber-600 dark:text-amber-400 font-bold" :
                                                            entry.label.includes("[Spine]") ? "text-cyan-600 dark:text-cyan-400 font-bold" :
                                                            "text-red-600 dark:text-red-400"
                                                        }>
                                                            {entry.label}
                                                        </div>
                                                        {entry.detail && (
                                                            <div className="text-slate-400 dark:text-zinc-500 pl-4">{entry.detail}</div>
                                                        )}
                                                    </div>
                                                ))}
                                                {section.skipped.map((line, j) => (
                                                    <div key={`s-${j}`} className="py-1 text-slate-400 dark:text-zinc-500">
                                                        SKIP: {line}
                                                    </div>
                                                ))}
                                            </>
                                        )}
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
