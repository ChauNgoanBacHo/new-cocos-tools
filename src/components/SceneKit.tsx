import { useEffect, useMemo, useState } from "react";
import { useStoredState } from "../hooks/useStoredState";

type SceneKitSourceType = "scene" | "fire";

interface BoilerplatePreview {
    gameId: string;
    sourceType?: SceneKitSourceType;
    projectRoot: string;
    tableFormat: number[];
    files: Array<{
        filePath: string;
        status: "new" | "exists";
    }>;
}

interface BoilerplateResult {
    gameId: string;
    sourceType?: SceneKitSourceType;
    projectRoot: string;
    tableFormat: number[];
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

function getSourceTypeFromPath(filePath: string): SceneKitSourceType | null {
    if (/\.fire$/i.test(filePath)) return "fire";
    if (/\.scene$/i.test(filePath)) return "scene";
    return null;
}

export default function SceneKit() {
    const [scenePath, setScenePath] = useStoredState<string>("scene-kit-scene-path", "");
    const [firePath, setFirePath] = useStoredState<string>("scene-kit-fire-path", "");
    const [sourceType, setSourceType] = useStoredState<SceneKitSourceType>("scene-kit-source-type", "scene");
    const [tableFormat, setTableFormat] = useStoredState<string>("scene-kit-table-format", "3,3,3,3,3");
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

    const activeSourcePath = sourceType === "fire" ? firePath : scenePath;
    const isSceneActive = sourceType === "scene";
    const isFireActive = sourceType === "fire";

    const resetPreviewState = () => {
        setPreview(null);
        setResult(null);
        setStatus({ type: null, message: "" });
    };

    const handlePreview = async (
        nextSourcePath = activeSourcePath,
        nextTableFormat = tableFormat,
        nextSourceType: SceneKitSourceType = sourceType,
    ) => {
        if (!nextSourcePath.trim()) {
            resetPreviewState();
            return;
        }

        const pathSourceType = getSourceTypeFromPath(nextSourcePath);
        if (pathSourceType !== nextSourceType) {
            resetPreviewState();
            return;
        }

        setIsLoading(true);
        setResult(null);
        setStatus({ type: null, message: "" });
        try {
            const nextPreview = await window.electronAPI.sceneKit.previewBoilerplate(nextSourcePath, nextTableFormat, nextSourceType);
            setPreview(nextPreview);
        } catch (error: any) {
            setPreview(null);
            setStatus({ type: "error", message: error.message || "Failed to preview Scene Kit files." });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelectSource = async (nextSourceType: SceneKitSourceType) => {
        const file = await window.electronAPI.sceneKit.selectSourceFile(nextSourceType);
        if (!file) return;
        setSourceType(nextSourceType);
        if (nextSourceType === "fire") {
            setFirePath(file);
        } else {
            setScenePath(file);
        }
        void handlePreview(file, tableFormat, nextSourceType);
    };

    const handleSourceTypeChange = (nextSourceType: SceneKitSourceType) => {
        setSourceType(nextSourceType);
        const nextPath = nextSourceType === "fire" ? firePath : scenePath;
        if (!nextPath.trim() || getSourceTypeFromPath(nextPath) !== nextSourceType) {
            resetPreviewState();
            return;
        }
        void handlePreview(nextPath, tableFormat, nextSourceType);
    };

    const handleCreate = async () => {
        if (!activeSourcePath.trim()) {
            setStatus({ type: "error", message: `Please choose a ${sourceType === "fire" ? "fire" : "scene"} file first.` });
            return;
        }

        setIsLoading(true);
        setStatus({ type: null, message: "" });
        try {
            const nextResult = await window.electronAPI.sceneKit.createBoilerplate(activeSourcePath, tableFormat, sourceType);
            setResult(nextResult);
            setPreview({
                gameId: nextResult.gameId,
                sourceType: nextResult.sourceType,
                projectRoot: nextResult.projectRoot,
                tableFormat: nextResult.tableFormat,
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
        const scenePathType = getSourceTypeFromPath(scenePath);
        const firePathType = getSourceTypeFromPath(firePath);

        if (scenePathType === "fire") {
            if (!firePath.trim()) {
                setFirePath(scenePath);
            }
            setScenePath("");
            setSourceType("fire");
            void handlePreview(scenePath, tableFormat, "fire");
            return;
        }

        if (firePathType === "scene") {
            if (!scenePath.trim()) {
                setScenePath(firePath);
            }
            setFirePath("");
            setSourceType("scene");
            void handlePreview(firePath, tableFormat, "scene");
            return;
        }

        if (activeSourcePath.trim()) {
            void handlePreview(activeSourcePath, tableFormat, sourceType);
        }
    }, []);

    const visibleFiles = result?.files ?? preview?.files ?? [];

    return (
        <div className="sm:col-span-2">
            <div className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-4 dark:border-zinc-700 md:flex-row md:items-center md:justify-between">
                <div className="text-left">
                    <h2 className="mb-1 text-2xl font-bold text-[#9b8cff]">Starter Kit</h2>
                    <p className="text-xs text-slate-500 dark:text-zinc-400">
                        Generate game-scoped source boilerplate from a Cocos source path
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
                                Starter Kit Source
                            </h3>
                        </div>

                        <div className={`grid grid-cols-1 items-center gap-2 transition-opacity sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4 ${
                            isSceneActive ? "opacity-100" : "opacity-45"
                        }`}>
                            <label className="text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
                                Scene Path <span className="text-red-500">*</span>
                            </label>
                            <div className="flex min-w-0 gap-2">
                                <input
                                    type="text"
                                    value={scenePath}
                                    readOnly
                                    disabled={!isSceneActive}
                                    placeholder="Cocos 3.x: choose .scene file"
                                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none disabled:cursor-not-allowed dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-100 dark:placeholder-zinc-500"
                                />
                                <button
                                    type="button"
                                    onClick={() => void handleSelectSource("scene")}
                                    disabled={isLoading || !isSceneActive}
                                    title="Choose Cocos 3.x scene file"
                                    aria-label="Choose Cocos 3.x scene file"
                                    className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition-all hover:border-[#7d6df7]/20 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-400 dark:hover:bg-[#232938] dark:hover:text-zinc-200">
                                    <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5A1.75 1.75 0 015.5 5.75h4l1.5 1.75h7a1.75 1.75 0 011.75 1.75v7A1.75 1.75 0 0118 18H5.5a1.75 1.75 0 01-1.75-1.75v-8.75z" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <div className={`grid grid-cols-1 items-center gap-2 transition-opacity sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4 ${
                            isFireActive ? "opacity-100" : "opacity-45"
                        }`}>
                            <label className="text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
                                Fire Path <span className="text-red-500">*</span>
                            </label>
                            <div className="flex min-w-0 gap-2">
                                <input
                                    type="text"
                                    value={firePath}
                                    readOnly
                                    disabled={!isFireActive}
                                    placeholder="Cocos 2.x: choose .fire file"
                                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none disabled:cursor-not-allowed dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-100 dark:placeholder-zinc-500"
                                />
                                <button
                                    type="button"
                                    onClick={() => void handleSelectSource("fire")}
                                    disabled={isLoading || !isFireActive}
                                    title="Choose Cocos 2.x fire file"
                                    aria-label="Choose Cocos 2.x fire file"
                                    className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition-all hover:border-[#7d6df7]/20 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-400 dark:hover:bg-[#232938] dark:hover:text-zinc-200">
                                    <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5A1.75 1.75 0 015.5 5.75h4l1.5 1.75h7a1.75 1.75 0 011.75 1.75v7A1.75 1.75 0 0118 18H5.5a1.75 1.75 0 01-1.75-1.75v-8.75z" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
                            <div />
                            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-white/5 dark:bg-[#1b2029]">
                                {(["scene", "fire"] as const).map((item) => (
                                    <button
                                        key={item}
                                        type="button"
                                        onClick={() => handleSourceTypeChange(item)}
                                        className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                                            sourceType === item
                                                ? "bg-[#7d6df7] text-white shadow-sm shadow-[#7d6df7]/25"
                                                : "text-slate-500 hover:bg-white hover:text-slate-700 dark:text-zinc-400 dark:hover:bg-[#232938] dark:hover:text-zinc-200"
                                        }`}>
                                        {item === "fire" ? "Use Cocos 2.x Fire" : "Use Cocos 3.x Scene"}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
                            <label className="text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
                                Table Format <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={tableFormat}
                                onChange={(event) => setTableFormat(event.target.value)}
                                onBlur={() => activeSourcePath.trim() && void handlePreview(activeSourcePath, tableFormat, sourceType)}
                                placeholder="3,3,3,3,3"
                                spellCheck={false}
                                className="min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-100 dark:placeholder-zinc-500"
                            />
                        </div>

                        {preview && (
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left dark:border-white/5 dark:bg-[#1b2029]">
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Game ID</div>
                                    <div className="mt-1 font-mono text-lg font-bold text-slate-800 dark:text-zinc-100">{preview.gameId}</div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left dark:border-white/5 dark:bg-[#1b2029]">
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Source</div>
                                    <div className="mt-1 font-mono text-lg font-bold text-slate-800 dark:text-zinc-100">{preview.sourceType === "fire" ? "Cocos 2.x" : "Cocos 3.x"}</div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left dark:border-white/5 dark:bg-[#1b2029] sm:col-span-2">
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Table Format</div>
                                    <div className="mt-1 font-mono text-lg font-bold text-slate-800 dark:text-zinc-100">[{preview.tableFormat.join(", ")}]</div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left dark:border-white/5 dark:bg-[#1b2029] sm:col-span-4">
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
                                {visibleFiles.map((file, index) => {
                                    const isDone = file.status === "created" || file.status === "exists" || file.status === "updated";
                                    const isExisting = file.status === "exists";
                                    const isUpdated = file.status === "updated";
                                    return (
                                        <div
                                            key={`${file.filePath}-${index}`}
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
                            disabled={isLoading || !activeSourcePath.trim()}
                            className="flex-1 cursor-pointer rounded-xl bg-[#7d6df7] px-6 py-3.5 text-sm font-bold text-white shadow-sm shadow-[#7d6df7]/25 transition-all hover:bg-[#9387ff] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-500">
                            Create Boilerplate
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
