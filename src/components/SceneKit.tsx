import { useEffect, useMemo, useState } from "react";
import { useStoredState } from "../hooks/useStoredState";

interface BoilerplatePreview {
    gameId: string;
    projectRoot: string;
    files: Array<{
        filePath: string;
        status: "new" | "exists";
    }>;
}

interface BoilerplateResult {
    gameId: string;
    projectRoot: string;
    files: Array<{
        filePath: string;
        status: "created" | "exists" | "updated";
    }>;
}

function getFileName(filePath: string) {
    return filePath.replace(/\\/g, "/").split("/").pop() || filePath;
}

function getParentLabel(projectRoot: string, filePath: string) {
    const normalizedRoot = projectRoot.replace(/\\/g, "/").replace(/\/+$/, "");
    const normalizedPath = filePath.replace(/\\/g, "/");
    const relativePath = normalizedPath.startsWith(`${normalizedRoot}/`)
        ? normalizedPath.slice(normalizedRoot.length + 1)
        : normalizedPath;
    const slashIndex = relativePath.lastIndexOf("/");
    return slashIndex >= 0 ? relativePath.slice(0, slashIndex) : ".";
}

export default function SceneKit() {
    const [scenePath, setScenePath] = useStoredState<string>("scene-kit-scene-path", "");
    const [preview, setPreview] = useState<BoilerplatePreview | null>(null);
    const [result, setResult] = useState<BoilerplateResult | null>(null);
    const [status, setStatus] = useState<{ type: "success" | "error" | null; message: string }>({
        type: null,
        message: "",
    });
    const [isLoading, setIsLoading] = useState(false);

    const createdCount = useMemo(
        () => result?.files.filter((file) => file.status === "created").length ?? 0,
        [result],
    );

    const updatedCount = useMemo(
        () => result?.files.filter((file) => file.status === "updated").length ?? 0,
        [result],
    );

    const existingCount = useMemo(
        () => (result || preview)?.files.filter((file) => file.status === "exists").length ?? 0,
        [preview, result],
    );

    const handlePreview = async (nextScenePath = scenePath) => {
        if (!nextScenePath.trim()) {
            setPreview(null);
            setResult(null);
            setStatus({ type: "error", message: "Please choose a scene file first." });
            return;
        }

        setIsLoading(true);
        setResult(null);
        setStatus({ type: null, message: "" });
        try {
            const nextPreview = await window.electronAPI.sceneKit.previewBoilerplate(nextScenePath);
            setPreview(nextPreview);
        } catch (error: any) {
            setPreview(null);
            setStatus({ type: "error", message: error.message || "Failed to preview Scene Kit files." });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelectScene = async () => {
        const file = await window.electronAPI.selectSceneFile();
        if (!file) return;
        setScenePath(file);
        void handlePreview(file);
    };

    const handleCreate = async () => {
        if (!scenePath.trim()) {
            setStatus({ type: "error", message: "Please choose a scene file first." });
            return;
        }

        setIsLoading(true);
        setStatus({ type: null, message: "" });
        try {
            const nextResult = await window.electronAPI.sceneKit.createBoilerplate(scenePath);
            setResult(nextResult);
            setPreview({
                gameId: nextResult.gameId,
                projectRoot: nextResult.projectRoot,
                files: nextResult.files.map((file) => ({
                    filePath: file.filePath,
                    status: file.status === "exists" ? "exists" : "new",
                })),
            });
            setStatus({
                type: "success",
                message: `Created ${nextResult.files.filter((file) => file.status === "created").length} file(s), updated ${nextResult.files.filter((file) => file.status === "updated").length} file(s).`,
            });
        } catch (error: any) {
            setStatus({ type: "error", message: error.message || "Failed to create Scene Kit files." });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (scenePath.trim()) {
            void handlePreview(scenePath);
        }
    }, []);

    const visibleFiles = result?.files ?? preview?.files ?? [];

    return (
        <div className="sm:col-span-2">
            <div className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-4 dark:border-zinc-700 md:flex-row md:items-center md:justify-between">
                <div className="text-left">
                    <h2 className="mb-1 text-2xl font-bold text-[#9b8cff]">Source</h2>
                    <p className="text-xs text-slate-500 dark:text-zinc-400">
                        Generate game-scoped source boilerplate from a Cocos scene path
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
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5.5 5.5h8.25L18.5 10v8.5H5.5v-13z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 5.75V10h4.25M8.25 13h7.5M8.25 16h5" />
                            </svg>
                            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
                                Boilerplate Source
                            </h3>
                        </div>

                        <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
                            <label className="text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
                                Scene Path <span className="text-red-500">*</span>
                            </label>
                            <div className="flex min-w-0 gap-2">
                                <input
                                    type="text"
                                    value={scenePath}
                                    readOnly
                                    placeholder="Choose g9691L.scene"
                                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-100 dark:placeholder-zinc-500"
                                />
                                <button
                                    type="button"
                                    onClick={handleSelectScene}
                                    disabled={isLoading}
                                    title="Choose scene file"
                                    aria-label="Choose scene file"
                                    className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition-all hover:border-[#7d6df7]/20 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-400 dark:hover:bg-[#232938] dark:hover:text-zinc-200">
                                    <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5A1.75 1.75 0 015.5 5.75h4l1.5 1.75h7a1.75 1.75 0 011.75 1.75v7A1.75 1.75 0 0118 18H5.5a1.75 1.75 0 01-1.75-1.75v-8.75z" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {preview && (
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left dark:border-white/5 dark:bg-[#1b2029]">
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Game ID</div>
                                    <div className="mt-1 font-mono text-lg font-bold text-slate-800 dark:text-zinc-100">{preview.gameId}</div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left dark:border-white/5 dark:bg-[#1b2029] sm:col-span-2">
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Project Root</div>
                                    <div className="mt-1 truncate font-mono text-xs text-slate-700 dark:text-zinc-200">{preview.projectRoot}</div>
                                </div>
                            </div>
                        )}

                    </div>

                    {visibleFiles.length > 0 && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-2.5 dark:border-zinc-600">
                                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
                                    Files
                                </h3>
                                <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                                    {createdCount > 0 ? `${createdCount} created, ` : ""}{updatedCount > 0 ? `${updatedCount} updated, ` : ""}{existingCount} existing
                                </div>
                            </div>

                            <div className="space-y-2">
                                {visibleFiles.map((file) => {
                                    const isDone = file.status === "created" || file.status === "exists" || file.status === "updated";
                                    const isExisting = file.status === "exists";
                                    const isUpdated = file.status === "updated";
                                    return (
                                        <div
                                            key={file.filePath}
                                            className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left dark:border-white/5 dark:bg-[#1b2029]">
                                            <div className="min-w-0">
                                                <div className="truncate font-mono text-sm font-bold text-slate-800 dark:text-zinc-100">
                                                    {getFileName(file.filePath)}
                                                </div>
                                                <div className="mt-1 truncate font-mono text-[11px] text-slate-500 dark:text-zinc-400">
                                                    {preview ? getParentLabel(preview.projectRoot, file.filePath) : file.filePath}
                                                </div>
                                            </div>
                                            <span className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${
                                                isExisting
                                                    ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                                                    : isUpdated
                                                        ? "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
                                                        : isDone
                                                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                                                        : "bg-[#7d6df7]/10 text-[#6b5ee8] dark:bg-[#7d6df7]/15 dark:text-[#b7a8ff]"
                                            }`}>
                                                {file.status}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="flex">
                        <button
                            type="button"
                            onClick={() => void handleCreate()}
                            disabled={isLoading || !scenePath.trim()}
                            className="flex-1 cursor-pointer rounded-xl bg-[#7d6df7] px-6 py-3.5 text-sm font-bold text-white shadow-sm shadow-[#7d6df7]/25 transition-all hover:bg-[#9387ff] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-500">
                            Create Boilerplate
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
