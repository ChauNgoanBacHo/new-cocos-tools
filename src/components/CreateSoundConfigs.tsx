import { useState } from "react";
import { useStoredState } from "../hooks/useStoredState";
import ActionPromptModal from "./ActionPromptModal";

interface SoundResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

interface CreateSoundConfigsProps {
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

// Cocos UUID compression: giữ 5 hex đầu, phần còn lại nén mỗi 3 hex (12 bit) -> 2 ký tự base64.
// VD: 03514d7d-70f6-4f78-8a17-cb1687d00ec0 -> 0351419cPZPeIoXyxaH0A7A
const BASE64_KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function compressUuid(uuid: string): string {
    const clean = uuid.trim().replace(/-/g, "");
    // Chỉ nén UUID đầy đủ (32 hex); giá trị khác (đã nén / không hợp lệ) giữ nguyên.
    if (!/^[0-9a-fA-F]{32}$/.test(clean)) return uuid.trim();
    let result = clean.slice(0, 5);
    for (let i = 5; i < 32; i += 3) {
        const hex1 = parseInt(clean[i], 16);
        const hex2 = parseInt(clean[i + 1], 16);
        const hex3 = parseInt(clean[i + 2], 16);
        result += BASE64_KEYS[(hex1 << 2) | (hex2 >> 2)];
        result += BASE64_KEYS[((hex2 & 3) << 4) | hex3];
    }
    return result;
}

export default function CreateSoundConfigs({ onOpenCodeHealth }: CreateSoundConfigsProps) {
    const [soundDir, setSoundDir] = useStoredState<string>("sound-dir", "");
    const [outputDir, setOutputDir] = useStoredState<string>("sound-output-dir", "");
    const [soundFileName, setSoundFileName] = useStoredState<string>("sound-file-name", "SoundConfig9000.ts");
    const [overwrite, setOverwrite] = useStoredState<boolean>("sound-overwrite", false);
    const [addRef, setAddRef] = useStoredState<boolean>("sound-add-ref", false);
    const [scenePath, setScenePath] = useStoredState<string>("sound-scene-path", "");
    const [componentHash, setComponentHash] = useStoredState<string>("sound-component-hash", "03514d7d-70f6-4f78-8a17-cb1687d00ec0");
    const [isRunning, setIsRunning] = useState(false);
    const [result, setResult] = useState<SoundResult | null>(null);
    const [refResult, setRefResult] = useState<SoundResult | null>(null);
    const [pendingCodeHealthPath, setPendingCodeHealthPath] = useState<string | null>(null);
    const [status, setStatus] = useState<{ type: "success" | "error" | null; message: string }>({
        type: null,
        message: "",
    });

    const handleSelectSoundDir = async () => {
        const folder = await window.electronAPI.selectFolder();
        if (folder) setSoundDir(folder);
    };

    const handleSelectOutputDir = async () => {
        const folder = await window.electronAPI.selectFolder();
        if (folder) setOutputDir(folder);
    };

    const handleSelectSceneFile = async () => {
        const file = await window.electronAPI.selectSceneFile();
        if (file) setScenePath(file);
    };

    const handleRun = async () => {
        if (!soundDir.trim()) {
            setStatus({ type: "error", message: "Vui lòng chọn folder sound!" });
            return;
        }
        if (!outputDir.trim()) {
            setStatus({ type: "error", message: "Vui lòng chọn output folder!" });
            return;
        }
        if (addRef && !scenePath.trim()) {
            setStatus({ type: "error", message: "Vui lòng chọn file .scene!" });
            return;
        }

        setIsRunning(true);
        setResult(null);
        setRefResult(null);
        setStatus({ type: null, message: "" });

        try {
            const res: SoundResult = await window.electronAPI.createSoundConfig(
                soundDir, outputDir, soundFileName, overwrite
            );
            setResult(res);

            if (addRef && scenePath.trim()) {
                const refRes: SoundResult = await window.electronAPI.bindSoundRefs(soundDir, scenePath, compressUuid(componentHash));
                setRefResult(refRes);
                if (res.exitCode === 0 && refRes.exitCode === 0) {
                    setStatus({ type: "success", message: "Tạo config và gắn ref thành công!" });
                    setPendingCodeHealthPath(getCodeHealthScriptsPath(outputDir));
                } else if (res.exitCode === 0) {
                    setStatus({ type: "error", message: "Tạo config OK nhưng gắn ref thất bại." });
                } else {
                    setStatus({ type: "error", message: "Có lỗi xảy ra." });
                }
            } else {
                if (res.exitCode === 0) {
                    setStatus({ type: "success", message: overwrite ? "Quét và tạo file thành công!" : "Quét thành công (không ghi file)." });
                    setPendingCodeHealthPath(getCodeHealthScriptsPath(outputDir));
                } else {
                    setStatus({ type: "error", message: "Có lỗi xảy ra khi quét." });
                }
            }
        } catch {
            setStatus({ type: "error", message: "Lỗi khi tạo config. Kiểm tra lại đường dẫn." });
        } finally {
            setIsRunning(false);
        }
    };

    const allOutput = [result?.stdout, refResult?.stdout].filter(Boolean).join("\n\n");

    const handleClearForm = () => {
        setSoundDir("");
        setOutputDir("");
        setSoundFileName("");
        setOverwrite(false);
        setAddRef(false);
        setScenePath("");
        setComponentHash("");
        setResult(null);
        setRefResult(null);
        setPendingCodeHealthPath(null);
        setStatus({ type: null, message: "" });
    };

    return (
        <div className="sm:col-span-2">
            <ActionPromptModal
                open={Boolean(pendingCodeHealthPath)}
                title="Create Sound Config thành công"
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
                        Sound Generator
                    </h2>
                    <p className="text-slate-500 dark:text-zinc-400 text-xs">
                        Quét folder Sound và tạo SoundConfig
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
                                Sound Folder <span className="text-red-500">*</span>
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={soundDir}
                                    onChange={(e) => setSoundDir(e.target.value)}
                                    placeholder="e.g., /path/to/Sounds/SFX"
                                    className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25 dark:bg-[#1b2029] dark:border-white/5 dark:text-zinc-100 dark:placeholder-zinc-500"
                                />
                                <button
                                    type="button"
                                    onClick={handleSelectSoundDir}
                                    title="Browse sound folder"
                                    aria-label="Browse sound folder"
                                    className="h-11 w-11 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-700 hover:border-[#7d6df7]/20 cursor-pointer dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-400 dark:hover:bg-[#232938] dark:hover:text-zinc-200">
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
                                Sound File Name
                            </label>
                            <div>
                                <input
                                    type="text"
                                    placeholder="SoundConfig9000.ts"
                                    value={soundFileName}
                                    onChange={(e) => setSoundFileName(e.target.value)}
                                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25 dark:bg-[#1b2029] dark:border-white/5 dark:text-zinc-100 dark:placeholder-zinc-500"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-2 sm:gap-4 items-center">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400 text-left">
                                Overwrite File
                            </label>
                            <div className="text-left">
                                <label className="inline-flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={overwrite}
                                        onChange={(e) => setOverwrite(e.target.checked)}
                                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <span className="text-sm text-slate-600 dark:text-zinc-400">
                                        {overwrite ? "Sẽ ghi đè file nếu đã tồn tại" : "Chỉ quét, không ghi file"}
                                    </span>
                                </label>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-2 sm:gap-4 items-center">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400 text-left">
                                Add Sound Ref
                            </label>
                            <div className="text-left">
                                <label className="inline-flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={addRef}
                                        onChange={(e) => setAddRef(e.target.checked)}
                                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <span className="text-sm text-slate-600 dark:text-zinc-400">
                                        {addRef ? "Gắn audio ref vào file .scene" : "Không gắn ref"}
                                    </span>
                                </label>
                            </div>
                        </div>

                        {addRef && (
                            <>
                            <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-2 sm:gap-4 items-center">
                                <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400 text-left">
                                    Scene File <span className="text-red-500">*</span>
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={scenePath}
                                        onChange={(e) => setScenePath(e.target.value)}
                                        placeholder="e.g., /path/to/main.scene"
                                        className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25 dark:bg-[#1b2029] dark:border-white/5 dark:text-zinc-100 dark:placeholder-zinc-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleSelectSceneFile}
                                        title="Browse scene file"
                                        aria-label="Browse scene file"
                                        className="h-11 w-11 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-700 hover:border-[#7d6df7]/20 cursor-pointer dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-400 dark:hover:bg-[#232938] dark:hover:text-zinc-200">
                                        <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5A1.75 1.75 0 015.5 5.75h4l1.5 1.75h7a1.75 1.75 0 011.75 1.75v7A1.75 1.75 0 0118 18H5.5a1.75 1.75 0 01-1.75-1.75v-8.75z" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-2 sm:gap-4 items-center">
                                <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400 text-left flex items-center gap-1">
                                    SoundModule UUID<span className="text-red-500">*</span>
                                    <span className="relative group">
                                        <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-slate-900 dark:bg-zinc-700 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                            UUID của SlotSoundPlayerModule. Nhập UUID đầy đủ, sẽ tự nén theo Cocos
                                        </span>
                                    </span>
                                </label>
                                <div>
                                    <input
                                        type="text"
                                        value={componentHash}
                                        onChange={(e) => setComponentHash(e.target.value)}
                                        placeholder="e.g., 03514d7d-70f6-4f78-8a17-cb1687d00ec0"
                                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25 dark:bg-[#1b2029] dark:border-white/5 dark:text-zinc-100 dark:placeholder-zinc-500"
                                    />
                                    {compressUuid(componentHash) !== componentHash.trim() && (
                                        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
                                            Compressed: <span className="text-emerald-600 dark:text-emerald-400">{compressUuid(componentHash)}</span>
                                        </p>
                                    )}
                                </div>
                            </div>
                            </>
                        )}
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

                    {(result || refResult) && (
                        <div className="px-6 space-y-4 max-h-[500px] overflow-y-auto">
                            {(allOutput || "No output")
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
                                            <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-bold">{section.title}</span>
                                        </div>
                                        <div className="p-4 text-sm font-mono text-left">
                                            {section.lines.map((line, j) => (
                                                <div key={j} className={`py-1 ${
                                                    line.includes("ERROR:") ? "text-red-600 dark:text-red-400" :
                                                    line.includes("Generated:") || line.includes("Bound") ? "text-emerald-600 dark:text-emerald-400" :
                                                    line.includes("SKIP:") || line.includes("not written") ? "text-yellow-600 dark:text-yellow-400" :
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
