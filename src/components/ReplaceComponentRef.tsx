import { useState } from "react";
import { useStoredState } from "../hooks/useStoredState";

interface ReplacementResult {
    targetFilePath: string;
    oldUuid: string;
    newUuid: string;
    replacements: Array<{
        from: string;
        to: string;
        count: number;
    }>;
    totalCount: number;
    changed: boolean;
}

function getFileName(filePath: string) {
    return filePath.replace(/\\/g, "/").split("/").pop() || filePath;
}

function getParentPath(filePath: string) {
    const normalizedPath = filePath.replace(/\\/g, "/");
    const slashIndex = normalizedPath.lastIndexOf("/");
    return slashIndex >= 0 ? normalizedPath.slice(0, slashIndex) : ".";
}

function PathInput({
    label,
    value,
    placeholder,
    onChange,
    onSelect,
}: {
    label: string;
    value: string;
    placeholder: string;
    onChange: (value: string) => void;
    onSelect?: () => void;
}) {
    return (
        <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
            <label className="text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
                {label} <span className="text-red-500">*</span>
            </label>
            <div className="flex min-w-0 gap-2">
                <input
                    type="text"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={placeholder}
                    spellCheck={false}
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-800 placeholder-slate-400 focus:outline-none dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-100 dark:placeholder-zinc-500"
                />
                {onSelect && (
                    <button
                        type="button"
                        onClick={onSelect}
                        title={`Choose ${label}`}
                        aria-label={`Choose ${label}`}
                        className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition-all hover:border-[#7d6df7]/20 hover:bg-slate-100 hover:text-slate-700 dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-400 dark:hover:bg-[#232938] dark:hover:text-zinc-200">
                        <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5A1.75 1.75 0 015.5 5.75h4l1.5 1.75h7a1.75 1.75 0 011.75 1.75v7A1.75 1.75 0 0118 18H5.5a1.75 1.75 0 01-1.75-1.75v-8.75z" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
}

export default function ReplaceComponentRef() {
    const [targetFilePath, setTargetFilePath] = useStoredState<string>("replace-ref-target-file", "");
    const [oldUuid, setOldUuid] = useStoredState<string>("replace-ref-old-uuid", "");
    const [newUuid, setNewUuid] = useStoredState<string>("replace-ref-new-uuid", "");
    const [preview, setPreview] = useState<ReplacementResult | null>(null);
    const [result, setResult] = useState<ReplacementResult | null>(null);
    const [status, setStatus] = useState<{ type: "success" | "error" | null; message: string }>({
        type: null,
        message: "",
    });
    const [isLoading, setIsLoading] = useState(false);

    const visibleResult = result ?? preview;

    const handleSelectTarget = async () => {
        const file = await window.electronAPI.sceneKit.selectSceneOrPrefabFile();
        if (!file) return;
        setTargetFilePath(file);
        setPreview(null);
        setResult(null);
    };

    const validateInputs = () => {
        if (!targetFilePath.trim() || !oldUuid.trim() || !newUuid.trim()) {
            setStatus({ type: "error", message: "Please choose target file, old UUID, and new UUID." });
            return false;
        }
        return true;
    };

    const handleReplace = async () => {
        if (!validateInputs()) return;

        setIsLoading(true);
        setStatus({ type: null, message: "" });
        try {
            const nextResult = await window.electronAPI.sceneKit.replaceUuidRef(targetFilePath, oldUuid, newUuid);
            setResult(nextResult);
            setPreview(null);
            setStatus({
                type: nextResult.changed ? "success" : "error",
                message: nextResult.changed
                    ? `Updated target file: ${nextResult.totalCount} UUID occurrence(s) replaced.`
                    : "No file changes. Target already uses the new UUID or no old reference was found.",
            });
        } catch (error: any) {
            setStatus({ type: "error", message: error.message || "Failed to replace UUID reference." });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="sm:col-span-2">
            <div className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-4 dark:border-zinc-700 md:flex-row md:items-center md:justify-between">
                <div className="text-left">
                    <h2 className="mb-1 text-2xl font-bold text-[#9b8cff]">Replace Ref</h2>
                    <p className="text-xs text-slate-500 dark:text-zinc-400">
                        Replace UUID references inside Cocos scene or prefab files
                    </p>
                </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_36px_rgba(148,163,184,0.16)] dark:border-white/5 dark:bg-[#2b3140] dark:shadow-[0_18px_36px_rgba(10,12,18,0.28)]">
                <div className="space-y-6 p-6">
                    {status.type && (
                        <div className={`rounded-xl border p-4 text-sm font-medium ${
                            status.type === "success"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                                : "border-red-200 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
                        }`}>
                            {status.message}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5 dark:border-zinc-600">
                            <svg className="h-4 w-4 text-[#b7a8ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8M8 12h8M8 17h5" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 5.5h15v13h-15v-13z" />
                            </svg>
                            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
                                UUID Reference
                            </h3>
                        </div>

                        <PathInput
                            label="Target File"
                            value={targetFilePath}
                            placeholder="Choose .scene or .prefab"
                            onChange={setTargetFilePath}
                            onSelect={() => void handleSelectTarget()}
                        />
                        <PathInput
                            label="Old UUID"
                            value={oldUuid}
                            placeholder="Old raw or compressed UUID"
                            onChange={setOldUuid}
                        />
                        <PathInput
                            label="New UUID"
                            value={newUuid}
                            placeholder="New raw or compressed UUID"
                            onChange={setNewUuid}
                        />
                    </div>

                    {visibleResult && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left dark:border-white/5 dark:bg-[#1b2029]">
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">References</div>
                                    <div className="mt-1 font-mono text-lg font-bold text-slate-800 dark:text-zinc-100">{visibleResult.totalCount}</div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left dark:border-white/5 dark:bg-[#1b2029] sm:col-span-2">
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Target</div>
                                    <div className="mt-1 truncate font-mono text-sm font-bold text-slate-800 dark:text-zinc-100">{getFileName(visibleResult.targetFilePath)}</div>
                                    <div className="mt-1 truncate font-mono text-[11px] text-slate-500 dark:text-zinc-400">{getParentPath(visibleResult.targetFilePath)}</div>
                                </div>
                            </div>

                            {visibleResult.replacements.length > 0 && (
                                <div className="space-y-2">
                                    {visibleResult.replacements.map((replacement) => (
                                        <div
                                            key={`${replacement.from}-${replacement.to}`}
                                            className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left dark:border-white/5 dark:bg-[#1b2029]">
                                            <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                                                {replacement.count} replacement(s)
                                            </div>
                                            <div className="truncate font-mono text-xs text-red-600 dark:text-red-300">{replacement.from}</div>
                                            <div className="truncate font-mono text-xs text-emerald-600 dark:text-emerald-300">{replacement.to}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex">
                        <button
                            type="button"
                            onClick={() => void handleReplace()}
                            disabled={isLoading}
                            className="flex-1 cursor-pointer rounded-xl bg-[#7d6df7] px-6 py-3.5 text-sm font-bold text-white shadow-sm shadow-[#7d6df7]/25 transition-all hover:bg-[#9387ff] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-500">
                            Replace Ref
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
