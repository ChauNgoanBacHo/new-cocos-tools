import { useState } from "react";
import SpinePreviewModal, { type SpineResult } from "./SpinePreviewModal";
import { useStoredState } from "../hooks/useStoredState";

const RESULTS_STORAGE_KEY = "spine-preview-last-results";

// Rút gọn path: chỉ giữ folder cha + tên file (2 đoạn cuối), bỏ phần đầu cho gọn.
// VD: data/9808-Animation/Cocos/9808_BG/9808_Spine/9808_UI_BG.json -> 9808_Spine/9808_UI_BG.json
function shortName(fileName: string): string {
    const parts = fileName.split("/").filter(Boolean);
    return parts.slice(-2).join("/");
}

export default function SpinePreview() {
    const [sourceDir, setSourceDir] = useStoredState<string>("spine-preview-source-dir", "");
    const [isRunning, setIsRunning] = useState(false);
    const [results, setResults] = useStoredState<SpineResult[]>(RESULTS_STORAGE_KEY, []);
    const [status, setStatus] = useState<{ type: "success" | "error" | null; message: string }>({
        type: null,
        message: "",
    });
    const [preview, setPreview] = useState<SpineResult | null>(null);
    const [search, setSearch] = useState("");

    const filteredResults = search.trim()
        ? results.filter(r => r.fileName.toLowerCase().includes(search.trim().toLowerCase()))
        : results;

    const handleSelectSourceDir = async () => {
        const folder = await window.electronAPI.selectFolder();
        if (folder) setSourceDir(folder);
    };

    const handleRun = async () => {
        if (!sourceDir.trim()) {
            setStatus({ type: "error", message: "Vui lòng chọn folder spine!" });
            return;
        }

        setIsRunning(true);
        setResults([]);
        setStatus({ type: null, message: "" });

        try {
            const res = await window.electronAPI.spinePreview(sourceDir);
            if (res.exitCode === 0) {
                setResults(res.results);
                setStatus({ type: "success", message: `Quét xong ${res.results.length} spine files.` });
            } else {
                setStatus({ type: "error", message: res.error || "Có lỗi xảy ra." });
            }
        } catch {
            setStatus({ type: "error", message: "Lỗi khi quét. Kiểm tra lại đường dẫn." });
        } finally {
            setIsRunning(false);
        }
    };

    const handleClearForm = () => {
        setSourceDir("");
        setResults([]);
        setStatus({ type: null, message: "" });
        setPreview(null);
    };

    return (
        <div>
            <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 dark:border-zinc-700 pb-4">
                <div className="text-left">
                    <h2 className="text-2xl font-bold text-[#9b8cff] mb-1">
                        Spine Viewer
                    </h2>
                    <p className="text-slate-500 dark:text-zinc-400 text-xs">
                        Quét Spine animation và preview
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
                                        : "bg-red-500/10 hover:bg-red-500/15 border-red-400/30 text-red-300 cursor-pointer"
                                }`}>
                                Clear
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-2 sm:gap-4 items-center">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400 text-left">
                                Spine Folder <span className="text-red-500">*</span>
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={sourceDir}
                                    onChange={(e) => setSourceDir(e.target.value)}
                                    placeholder="e.g., /path/to/Animation"
                                    className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25 dark:bg-[#1b2029] dark:border-white/5 dark:text-zinc-100 dark:placeholder-zinc-500"
                                />
                                <button
                                    type="button"
                                    onClick={handleSelectSourceDir}
                                    title="Browse spine folder"
                                    aria-label="Browse spine folder"
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
                                "Scan"
                            )}
                        </button>
                    </div>

                    {results.length > 0 && (
                        <div className="space-y-3">
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search file name..."
                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25 dark:bg-[#1b2029] dark:border-white/5 dark:text-zinc-100 dark:placeholder-zinc-500"
                            />
                        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-zinc-700">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 dark:bg-white/5 text-xs uppercase tracking-wider text-slate-600 dark:text-zinc-400 border-b border-slate-200 dark:border-white/5">
                                    <tr>
                                        <th className="px-5 py-3 font-semibold text-center">Preview</th>
                                        <th className="px-5 py-3 font-semibold">File Name</th>
                                        <th className="px-5 py-3 font-semibold text-center">Slots</th>
                                        <th className="px-5 py-3 font-semibold text-center">Est. Drawcall</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                                    {filteredResults.map((row, i) => (
                                        <tr key={i} className="bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                                            <td className="px-4 py-3 text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => setPreview(row)}
                                                    className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-[#7d6df7]/10 text-[#c2b7ff] border border-[#7d6df7]/25 hover:bg-[#7d6df7]/18 transition-all cursor-pointer">
                                                    ▶ Preview
                                                </button>
                                            </td>
                                            <td className="px-4 py-3 font-mono text-slate-700 dark:text-zinc-300 text-xs" title={row.fileName}>{shortName(row.fileName)}</td>
                                            <td className="px-4 py-3 text-center text-slate-600 dark:text-zinc-400">{row.slots}</td>
                                            <td className={`px-4 py-3 text-center font-bold ${
                                                row.estDrawcall <= 2 ? "text-emerald-600 dark:text-emerald-400" :
                                                row.estDrawcall <= 5 ? "text-amber-600 dark:text-amber-400" :
                                                "text-red-600 dark:text-red-400"
                                            }`}>{row.estDrawcall}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        </div>
                    )}
                </div>
            </div>

            {preview && (
                <SpinePreviewModal
                    item={preview}
                    onClose={() => setPreview(null)}
                    onNext={() => {
                        const currentIndex = filteredResults.findIndex(r => r.fileName === preview.fileName);
                        if (currentIndex < filteredResults.length - 1) {
                            setPreview(filteredResults[currentIndex + 1]);
                        }
                    }}
                    onPrev={() => {
                        const currentIndex = filteredResults.findIndex(r => r.fileName === preview.fileName);
                        if (currentIndex > 0) {
                            setPreview(filteredResults[currentIndex - 1]);
                        }
                    }}
                    hasNext={filteredResults.findIndex(r => r.fileName === preview.fileName) < filteredResults.length - 1}
                    hasPrev={filteredResults.findIndex(r => r.fileName === preview.fileName) > 0}
                />
            )}
        </div>
    );
}
