import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { Spine } from "pixi-spine";
import type { SpineResult } from "./SpinePreviewModal";
import { useStoredState } from "../hooks/useStoredState";
import { SPINE_ALIASES_STORAGE_KEY, type SpineAlias } from "../constants/spineAliases";
import { SpineStage } from "../spine/SpineStage";

const RESULTS_STORAGE_KEY = "spine-preview-last-results";
const SPINE_DRAG_MIME = "application/x-one-punch-spine-preview";
const PREVIEW_FRAME = 1 / 60;

// Rút gọn path: chỉ giữ folder cha + tên file (2 đoạn cuối), bỏ phần đầu cho gọn.
// VD: data/9808-Animation/Cocos/9808_BG/9808_Spine/9808_UI_BG.json -> 9808_Spine/9808_UI_BG.json
function shortName(fileName: string): string {
    const parts = fileName.split("/").filter(Boolean);
    return parts.slice(-2).join("/");
}

function spineDisplayName(fileName: string): string {
    return shortName(fileName).split("/").pop()?.replace(/\.json$/i, "") || fileName;
}

type PreviewInstance = {
    id: string;
    item: SpineResult;
    spine: Spine | null;
    loading: boolean;
    error: string | null;
    currentAnimation: string;
    currentSkin: string;
    loop: boolean;
    paused: boolean;
    speed: number;
    zoom: number;
    defaultMix: number;
    mixRules: Array<{ from: string; to: string; duration: number }>;
    mixFrom: string;
    mixTo: string;
    sequence: string[];
    loopLast: boolean;
};

export default function SpinePreview() {
    const [sourceDir, setSourceDir] = useStoredState<string>("spine-preview-source-dir", "");
    const [isRunning, setIsRunning] = useState(false);
    const [results, setResults] = useStoredState<SpineResult[]>(RESULTS_STORAGE_KEY, []);
    const [aliases] = useStoredState<SpineAlias[]>(SPINE_ALIASES_STORAGE_KEY, []);
    const [status, setStatus] = useState<{ type: "success" | "error" | null; message: string }>({
        type: null,
        message: "",
    });
    const [search, setSearch] = useState("");
    const [selectedAliasId, setSelectedAliasId] = useState("");
    const [selectedResultKeys, setSelectedResultKeys] = useState<string[]>([]);
    const [dropActive, setDropActive] = useState(false);
    const [previewInstances, setPreviewInstances] = useState<PreviewInstance[]>([]);
    const [activePreviewInstanceId, setActivePreviewInstanceId] = useState("");
    const [inlinePreviewError, setInlinePreviewError] = useState<string | null>(null);
    const [backgroundMode, setBackgroundMode] = useState<"theme" | "checker" | "color">("theme");
    const [backgroundColor, setBackgroundColor] = useState("#161a22");
    const [spinePopover, setSpinePopover] = useState<{
        instanceId: string;
        x: number;
        y: number;
        showAnimations: boolean;
    } | null>(null);
    const previewViewportRef = useRef<HTMLDivElement>(null);
    const inlineStageRef = useRef<SpineStage | null>(null);
    const previewInstancesRef = useRef<PreviewInstance[]>([]);
    const previewDragRef = useRef<{
        pointerId: number;
        instanceId: string;
        lastX: number;
        lastY: number;
    } | null>(null);

    const filteredResults = useMemo(() => (
        search.trim()
            ? results.filter(r => r.fileName.toLowerCase().includes(search.trim().toLowerCase()))
            : results
    ), [results, search]);

    const selectedResultSet = useMemo(() => new Set(selectedResultKeys), [selectedResultKeys]);
    const activePreviewInstance = previewInstances.find((instance) => instance.id === activePreviewInstanceId) ?? previewInstances[0] ?? null;
    const popoverPreviewInstance = spinePopover
        ? previewInstances.find((instance) => instance.id === spinePopover.instanceId) ?? null
        : null;

    useEffect(() => {
        previewInstancesRef.current = previewInstances;
    }, [previewInstances]);

    useEffect(() => {
        if (results.length === 0 || inlineStageRef.current) return;

        const viewport = previewViewportRef.current;
        if (!viewport) return;

        const stage = new SpineStage(viewport, {
            backgroundColor: 0x000000,
            backgroundAlpha: 0,
        });
        inlineStageRef.current = stage;

        const resizeObserver = new ResizeObserver(() => stage.renderOnce());
        resizeObserver.observe(viewport);
        window.requestAnimationFrame(() => stage.renderOnce());

        return () => {
            resizeObserver.disconnect();
            stage.destroy();
            inlineStageRef.current = null;
        };
    }, [results.length]);

    const findResultByKey = (key: string) => results.find((item) => item.jsonPath === key);

    const addItemsToInlinePreview = async (items: SpineResult[], point?: { x: number; y: number }) => {
        const stage = inlineStageRef.current;
        if (!stage) {
            setInlinePreviewError("Không tạo được khung preview.");
            return;
        }

        const uniqueItems = items.filter((item) =>
            !previewInstancesRef.current.some((instance) => instance.item.jsonPath === item.jsonPath)
        );
        if (uniqueItems.length === 0) return;

        setInlinePreviewError(null);
        setSelectedResultKeys((prev) =>
            prev.filter((key) => !uniqueItems.some((item) => item.jsonPath === key))
        );

        for (const item of uniqueItems) {
            const instanceId = `spine-preview-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            const pendingInstance: PreviewInstance = {
                id: instanceId,
                item,
                spine: null,
                loading: true,
                error: null,
                currentAnimation: item.animations[0] ?? "",
                currentSkin: item.skins.includes("default") ? "default" : item.skins[0] ?? "",
                loop: true,
                paused: false,
                speed: 1,
                zoom: 1,
                defaultMix: 0,
                mixRules: [],
                mixFrom: "",
                mixTo: "",
                sequence: [],
                loopLast: true,
            };
            setPreviewInstances((prev) => [...prev, pendingInstance]);

            try {
                const spine = await stage.loadSpine({
                    jsonPath: item.jsonPath,
                    atlasPath: item.atlasPath,
                });

                if (item.skins.length > 0) {
                    SpineStage.setSkin(spine, item.skins.includes("default") ? "default" : item.skins[0]);
                }

                const firstAnimation = item.animations[0];
                if (firstAnimation) {
                    SpineStage.playAnimation(spine, firstAnimation, true);
                }
                spine.state.timeScale = 1;
                spine.update(0);
                stage.setSpineScale(spine, 1);
                const targetPoint = point ?? {
                    x: stage.app.screen.width / 2,
                    y: stage.app.screen.height / 2,
                };
                stage.centerSpineAt(spine, targetPoint.x, targetPoint.y);
                stage.renderOnce();

                setPreviewInstances((prev) =>
                    prev.map((instance) =>
                        instance.id === instanceId
                            ? { ...instance, spine, loading: false }
                            : instance
                    )
                );
                setActivePreviewInstanceId(instanceId);
            } catch (error) {
                setPreviewInstances((prev) =>
                    prev.map((instance) =>
                        instance.id === instanceId
                            ? {
                                ...instance,
                                loading: false,
                                error: error instanceof Error ? error.message : "Không thể load spine.",
                            }
                            : instance
                    )
                );
            }
        }
    };

    const removePreviewInstance = (instanceId: string) => {
        const instance = previewInstancesRef.current.find((item) => item.id === instanceId);
        inlineStageRef.current?.removeSpine(instance?.spine);
        setPreviewInstances((prev) => prev.filter((item) => item.id !== instanceId));
        setSpinePopover((current) => current?.instanceId === instanceId ? null : current);
        setActivePreviewInstanceId((currentId) => {
            if (currentId !== instanceId) return currentId;
            return previewInstancesRef.current.find((item) => item.id !== instanceId)?.id ?? "";
        });
    };

    const clearInlinePreview = () => {
        inlineStageRef.current?.clearSpines();
        setPreviewInstances([]);
        setActivePreviewInstanceId("");
        setInlinePreviewError(null);
        setSpinePopover(null);
    };

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
        setSelectedResultKeys([]);
        clearInlinePreview();
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
        setSelectedResultKeys([]);
        setStatus({ type: null, message: "" });
        clearInlinePreview();
    };

    const handleUseAlias = (alias: SpineAlias) => {
        setSelectedAliasId(alias.id);
        setSourceDir(alias.path);
        setStatus({
            type: "success",
            message: `Đã chọn alias "${alias.name}".`,
        });
    };

    const sortedAliases = [...aliases].sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" })
    );

    const toggleSelectedResult = (key: string) => {
        setSelectedResultKeys((prev) =>
            prev.includes(key)
                ? prev.filter((item) => item !== key)
                : [...prev, key]
        );
    };

    const buildDragItems = (row: SpineResult) => {
        const selectedItems = selectedResultKeys
            .map((key) => findResultByKey(key))
            .filter((item): item is SpineResult => Boolean(item));

        if (selectedResultSet.has(row.jsonPath) && selectedItems.length > 0) {
            return selectedItems;
        }

        return [row];
    };

    const handleResultDragStart = (event: DragEvent<HTMLDivElement>, row: SpineResult) => {
        const items = buildDragItems(row);
        const keys = items.map((item) => item.jsonPath);
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData(SPINE_DRAG_MIME, JSON.stringify(keys));
        event.dataTransfer.setData("text/plain", keys.join("\n"));
    };

    const resolveDroppedItems = (event: DragEvent<HTMLDivElement>) => {
        const rawPayload = event.dataTransfer.getData(SPINE_DRAG_MIME);
        if (rawPayload) {
            try {
                const keys = JSON.parse(rawPayload) as unknown;
                if (Array.isArray(keys)) {
                    return keys
                        .map((key) => typeof key === "string" ? findResultByKey(key) : null)
                        .filter((item): item is SpineResult => Boolean(item));
                }
            } catch {
                return [];
            }
        }

        return event.dataTransfer
            .getData("text/plain")
            .split(/\n+/)
            .map((key) => findResultByKey(key.trim()))
            .filter((item): item is SpineResult => Boolean(item));
    };

    const handlePreviewDragOver = (event: DragEvent<HTMLDivElement>) => {
        if (event.dataTransfer.types.includes(SPINE_DRAG_MIME) || event.dataTransfer.types.includes("text/plain")) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setDropActive(true);
        }
    };

    const handlePreviewDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDropActive(false);
        const droppedItems = resolveDroppedItems(event);
        const point = inlineStageRef.current?.clientToCanvasPoint(event.clientX, event.clientY);
        void addItemsToInlinePreview(droppedItems, point);
    };

    const handlePreviewPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        setSpinePopover(null);
        const stage = inlineStageRef.current;
        if (!stage) return;

        const hitSpine = stage.hitTest(event.clientX, event.clientY);
        const hitInstance = previewInstancesRef.current.find((instance) => instance.spine === hitSpine);
        if (!hitSpine || !hitInstance) return;

        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        stage.bringToFront(hitSpine);
        setActivePreviewInstanceId(hitInstance.id);
        previewDragRef.current = {
            pointerId: event.pointerId,
            instanceId: hitInstance.id,
            lastX: event.clientX,
            lastY: event.clientY,
        };
    };

    const handlePreviewPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const drag = previewDragRef.current;
        const stage = inlineStageRef.current;
        if (!drag || !stage || drag.pointerId !== event.pointerId) return;

        const instance = previewInstancesRef.current.find((item) => item.id === drag.instanceId);
        if (!instance?.spine) return;

        const deltaX = event.clientX - drag.lastX;
        const deltaY = event.clientY - drag.lastY;
        drag.lastX = event.clientX;
        drag.lastY = event.clientY;
        stage.moveSpineBy(instance.spine, deltaX, deltaY);
        stage.renderOnce();
    };

    const handlePreviewPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
        const drag = previewDragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;

        event.currentTarget.releasePointerCapture(event.pointerId);
        previewDragRef.current = null;
    };

    const handlePreviewContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        const stage = inlineStageRef.current;
        if (!stage) return;

        const hitSpine = stage.hitTest(event.clientX, event.clientY);
        const hitInstance = previewInstancesRef.current.find((instance) => instance.spine === hitSpine);
        if (!hitSpine || !hitInstance) {
            setSpinePopover(null);
            return;
        }

        stage.bringToFront(hitSpine);
        stage.renderOnce();
        setActivePreviewInstanceId(hitInstance.id);
        const rect = event.currentTarget.getBoundingClientRect();
        setSpinePopover({
            instanceId: hitInstance.id,
            x: Math.min(Math.max(event.clientX - rect.left, 12), rect.width - 220),
            y: Math.min(Math.max(event.clientY - rect.top, 12), rect.height - 96),
            showAnimations: false,
        });
    };

    const updatePreviewInstance = (instanceId: string, patch: Partial<PreviewInstance>) => {
        setPreviewInstances((prev) =>
            prev.map((instance) =>
                instance.id === instanceId
                    ? { ...instance, ...patch }
                    : instance
            )
        );
    };

    const handleSelectPreviewAnimation = (animationName: string) => {
        const instance = activePreviewInstance;
        if (!instance?.spine) return;
        SpineStage.playAnimation(instance.spine, animationName, instance.loop);
        instance.spine.state.timeScale = instance.paused ? 0 : instance.speed;
        updatePreviewInstance(instance.id, { currentAnimation: animationName });
    };

    const handleSelectPreviewSkin = (skinName: string) => {
        const instance = activePreviewInstance;
        if (!instance?.spine) return;
        SpineStage.setSkin(instance.spine, skinName);
        if (instance.currentAnimation) {
            SpineStage.playAnimation(instance.spine, instance.currentAnimation, instance.loop);
        }
        instance.spine.state.timeScale = instance.paused ? 0 : instance.speed;
        updatePreviewInstance(instance.id, { currentSkin: skinName });
    };

    const handleTogglePreviewLoop = () => {
        const instance = activePreviewInstance;
        if (!instance?.spine || !instance.currentAnimation) return;
        const nextLoop = !instance.loop;
        SpineStage.playAnimation(instance.spine, instance.currentAnimation, nextLoop);
        instance.spine.state.timeScale = instance.paused ? 0 : instance.speed;
        updatePreviewInstance(instance.id, { loop: nextLoop });
    };

    const handleTogglePreviewPaused = () => {
        const instance = activePreviewInstance;
        if (!instance?.spine) return;
        const nextPaused = !instance.paused;
        instance.spine.state.timeScale = nextPaused ? 0 : instance.speed;
        updatePreviewInstance(instance.id, { paused: nextPaused });
    };

    const handlePreviewSpeed = (speed: number) => {
        const instance = activePreviewInstance;
        if (!instance?.spine) return;
        instance.spine.state.timeScale = instance.paused ? 0 : speed;
        updatePreviewInstance(instance.id, { speed });
    };

    const handlePreviewZoom = (factor: number) => {
        const stage = inlineStageRef.current;
        const instance = activePreviewInstance;
        if (!stage || !instance?.spine) return;
        const nextZoom = stage.setSpineScale(instance.spine, instance.zoom * factor);
        updatePreviewInstance(instance.id, { zoom: nextZoom });
        stage.renderOnce();
    };

    const handlePreviewZoomReset = () => {
        const stage = inlineStageRef.current;
        const instance = activePreviewInstance;
        if (!stage || !instance?.spine) return;
        const nextZoom = stage.setSpineScale(instance.spine, 1);
        updatePreviewInstance(instance.id, { zoom: nextZoom });
        stage.renderOnce();
    };

    const handlePreviewStepFrame = (delta: number) => {
        const stage = inlineStageRef.current;
        const instance = activePreviewInstance;
        if (!stage || !instance?.spine) return;
        const playback = SpineStage.currentPlayback(instance.spine);
        SpineStage.seek(instance.spine, playback.elapsed + delta);
        instance.spine.state.timeScale = 0;
        updatePreviewInstance(instance.id, { paused: true });
        stage.renderOnce();
    };

    const handlePreviewStepPointerDown = (event: React.PointerEvent<HTMLButtonElement>, delta: number) => {
        event.preventDefault();
        event.stopPropagation();
        handlePreviewStepFrame(delta);
    };

    const handlePreviewDefaultMix = (value: number) => {
        const instance = activePreviewInstance;
        if (!instance) return;
        if (instance.spine) {
            SpineStage.setDefaultMix(instance.spine, value);
        }
        updatePreviewInstance(instance.id, { defaultMix: value });
    };

    const handlePreviewMixFrom = (animationName: string) => {
        const instance = activePreviewInstance;
        if (!instance) return;
        updatePreviewInstance(instance.id, { mixFrom: animationName });
    };

    const handlePreviewMixTo = (animationName: string) => {
        const instance = activePreviewInstance;
        if (!instance) return;
        updatePreviewInstance(instance.id, { mixTo: animationName });
    };

    const handleAddPreviewMixRule = () => {
        const instance = activePreviewInstance;
        if (!instance?.mixFrom || !instance.mixTo) return;
        const duration = instance.defaultMix || 0.2;
        if (instance.spine) {
            SpineStage.setMix(instance.spine, instance.mixFrom, instance.mixTo, duration);
        }
        updatePreviewInstance(instance.id, {
            mixRules: [
                ...instance.mixRules,
                { from: instance.mixFrom, to: instance.mixTo, duration },
            ],
            mixFrom: "",
            mixTo: "",
        });
    };

    const handleUpdatePreviewMixRule = (index: number, duration: number) => {
        const instance = activePreviewInstance;
        if (!instance) return;
        const rule = instance.mixRules[index];
        if (!rule) return;
        if (instance.spine) {
            SpineStage.setMix(instance.spine, rule.from, rule.to, duration);
        }
        updatePreviewInstance(instance.id, {
            mixRules: instance.mixRules.map((item, itemIndex) =>
                itemIndex === index ? { ...item, duration } : item
            ),
        });
    };

    const handleRemovePreviewMixRule = (index: number) => {
        const instance = activePreviewInstance;
        if (!instance) return;
        const rule = instance.mixRules[index];
        if (!rule) return;
        if (instance.spine) {
            SpineStage.setMix(instance.spine, rule.from, rule.to, instance.defaultMix);
        }
        updatePreviewInstance(instance.id, {
            mixRules: instance.mixRules.filter((_, itemIndex) => itemIndex !== index),
        });
    };

    const handleAddCurrentAnimationToSequence = () => {
        const instance = activePreviewInstance;
        if (!instance?.currentAnimation) return;
        updatePreviewInstance(instance.id, {
            sequence: [...instance.sequence, instance.currentAnimation],
        });
    };

    const handleRemoveSequenceItem = (index: number) => {
        const instance = activePreviewInstance;
        if (!instance) return;
        updatePreviewInstance(instance.id, {
            sequence: instance.sequence.filter((_, itemIndex) => itemIndex !== index),
        });
    };

    const handleClearSequence = () => {
        const instance = activePreviewInstance;
        if (!instance) return;
        updatePreviewInstance(instance.id, { sequence: [] });
    };

    const handleToggleLoopLast = () => {
        const instance = activePreviewInstance;
        if (!instance) return;
        updatePreviewInstance(instance.id, { loopLast: !instance.loopLast });
    };

    const handlePlaySequence = () => {
        const instance = activePreviewInstance;
        if (!instance?.spine || instance.sequence.length === 0) return;
        SpineStage.playSequence(instance.spine, instance.sequence, instance.loopLast);
        instance.spine.state.timeScale = instance.paused ? 0 : instance.speed;
        updatePreviewInstance(instance.id, {
            currentAnimation: instance.sequence[0] ?? instance.currentAnimation,
        });
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
                                        : "bg-red-50 hover:bg-red-100 border-red-200 text-red-600 cursor-pointer dark:bg-red-500/10 dark:hover:bg-red-500/15 dark:border-red-400/30 dark:text-red-300"
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

                        <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-2 sm:gap-4 items-center">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400 text-left">
                                Alias
                            </label>
                            <div className="min-w-0 space-y-2">
                                {sortedAliases.length > 0 ? (
                                    <div className="flex min-w-0 gap-2">
                                        <select
                                            value={selectedAliasId}
                                            onChange={(event) => {
                                                setSelectedAliasId(event.target.value);
                                                const alias = aliases.find((item) => item.id === event.target.value);
                                                if (alias) handleUseAlias(alias);
                                            }}
                                            className="min-w-0 flex-1 truncate px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25 dark:bg-[#1b2029] dark:border-white/5 dark:text-zinc-100">
                                            <option value="">
                                                Select alias...
                                            </option>
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
                                        <span>to create Spine Viewer aliases.</span>
                                    </div>
                                )}
                                {selectedAliasId && (
                                    <div className="truncate text-[11px] text-slate-500 dark:text-zinc-400">
                                        {sortedAliases.find((alias) => alias.id === selectedAliasId)?.path}
                                    </div>
                                )}
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
                        <div className="px-6 pb-6 space-y-4">
                            <div className="space-y-3">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                                    <div>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 font-mono">
                                            Spine List
                                        </h3>
                                        <p className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
                                            Click để highlight nhiều spine, kéo một item đang chọn để drop cả nhóm.
                                        </p>
                                    </div>
                                    <input
                                        type="text"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Search spine..."
                                        className="w-full lg:w-[320px] px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25 dark:bg-[#1b2029] dark:border-white/5 dark:text-zinc-100 dark:placeholder-zinc-500"
                                    />
                                </div>

                                <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/5 dark:bg-[#1b2029]">
                                    {filteredResults.map((row) => {
                                        const isLoaded = previewInstances.some((instance) => instance.item.jsonPath === row.jsonPath);
                                        return (
                                            <div
                                                key={row.jsonPath}
                                                draggable
                                                onClick={() => {
                                                    if (!isLoaded) toggleSelectedResult(row.jsonPath);
                                                }}
                                                onDragStart={(event) => handleResultDragStart(event, row)}
                                                title={shortName(row.fileName)}
                                                className={`inline-flex min-h-9 max-w-full items-center rounded-lg border px-3 py-2 text-xs font-semibold leading-4 transition-all cursor-grab active:cursor-grabbing ${
                                                    isLoaded
                                                        ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:border-emerald-400 dark:border-emerald-400/35 dark:bg-emerald-500/10 dark:text-emerald-200"
                                                        : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:text-emerald-700 dark:border-white/5 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-emerald-400/35 dark:hover:text-emerald-200"
                                                }`}>
                                                <span className="whitespace-normal break-words">{spineDisplayName(row.fileName)}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-4">
                                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/5 dark:bg-zinc-900 space-y-4 xl:order-2">
                                    <div>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 font-mono">
                                            Preview Control
                                        </h3>
                                        <p className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
                                            {activePreviewInstance ? spineDisplayName(activePreviewInstance.item.fileName) : "No active spine"}
                                        </p>
                                    </div>

                                    {activePreviewInstance && (
                                        <div className="space-y-3">
                                            <label className="block space-y-1.5">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                                                    Active Spine
                                                </span>
                                                <select
                                                    value={activePreviewInstance.id}
                                                    onChange={(event) => setActivePreviewInstanceId(event.target.value)}
                                                    className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-[#1b2029] border border-slate-200 dark:border-white/5 text-slate-700 dark:text-zinc-200 focus:outline-none focus:border-[#7d6df7] cursor-pointer">
                                                    {previewInstances.map((instance) => (
                                                        <option key={instance.id} value={instance.id}>
                                                            {spineDisplayName(instance.item.fileName)}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>

                                            <label className="block space-y-1.5">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                                                    Play Animation
                                                </span>
                                                <select
                                                    value={activePreviewInstance.currentAnimation}
                                                    disabled={!activePreviewInstance.spine || activePreviewInstance.item.animations.length === 0}
                                                    onChange={(event) => handleSelectPreviewAnimation(event.target.value)}
                                                    className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-[#1b2029] border border-slate-200 dark:border-white/5 text-slate-700 dark:text-zinc-200 focus:outline-none focus:border-[#7d6df7] disabled:opacity-50 cursor-pointer">
                                                    {activePreviewInstance.item.animations.map((animation) => (
                                                        <option key={animation} value={animation}>
                                                            {animation}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>

                                            {activePreviewInstance.item.skins.length > 1 && (
                                                <label className="block space-y-1.5">
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                                                        Skin
                                                    </span>
                                                    <select
                                                        value={activePreviewInstance.currentSkin}
                                                        disabled={!activePreviewInstance.spine}
                                                        onChange={(event) => handleSelectPreviewSkin(event.target.value)}
                                                        className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-[#1b2029] border border-slate-200 dark:border-white/5 text-slate-700 dark:text-zinc-200 focus:outline-none focus:border-[#7d6df7] disabled:opacity-50 cursor-pointer">
                                                        {activePreviewInstance.item.skins.map((skin) => (
                                                            <option key={skin} value={skin}>
                                                                {skin}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                            )}

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                                                    Animation Mix (Crossfade)
                                                </label>
                                                <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-2">
                                                    <span className="font-mono text-[10px] text-slate-500 dark:text-zinc-400">Default</span>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={5}
                                                        step={0.05}
                                                        value={activePreviewInstance.defaultMix}
                                                        disabled={!activePreviewInstance.spine}
                                                        onChange={(event) => handlePreviewDefaultMix(parseFloat(event.target.value) || 0)}
                                                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-mono text-slate-700 focus:outline-none focus:border-[#7d6df7] disabled:opacity-50 dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-200"
                                                    />
                                                </div>

                                                <div className="flex items-end gap-1.5">
                                                    <select
                                                        value={activePreviewInstance.mixFrom}
                                                        disabled={!activePreviewInstance.spine}
                                                        onChange={(event) => handlePreviewMixFrom(event.target.value)}
                                                        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] text-slate-700 focus:outline-none focus:border-[#7d6df7] disabled:opacity-50 dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-200 cursor-pointer">
                                                        <option value="">From...</option>
                                                        {activePreviewInstance.item.animations.map((animation) => (
                                                            <option key={`mix-from-${animation}`} value={animation}>
                                                                {animation}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <span className="pb-1.5 text-[10px] text-slate-400">→</span>
                                                    <select
                                                        value={activePreviewInstance.mixTo}
                                                        disabled={!activePreviewInstance.spine}
                                                        onChange={(event) => handlePreviewMixTo(event.target.value)}
                                                        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] text-slate-700 focus:outline-none focus:border-[#7d6df7] disabled:opacity-50 dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-200 cursor-pointer">
                                                        <option value="">To...</option>
                                                        {activePreviewInstance.item.animations.map((animation) => (
                                                            <option key={`mix-to-${animation}`} value={animation}>
                                                                {animation}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <button
                                                        type="button"
                                                        disabled={!activePreviewInstance.spine || !activePreviewInstance.mixFrom || !activePreviewInstance.mixTo}
                                                        onClick={handleAddPreviewMixRule}
                                                        className={`rounded-lg px-2 py-1.5 text-[10px] font-bold transition-all ${
                                                            !activePreviewInstance.spine || !activePreviewInstance.mixFrom || !activePreviewInstance.mixTo
                                                                ? "bg-slate-200 text-slate-400 dark:bg-zinc-800 dark:text-zinc-600 cursor-not-allowed"
                                                                : "bg-[#7d6df7] text-white hover:bg-[#9387ff] cursor-pointer"
                                                        }`}>
                                                        + Add
                                                    </button>
                                                </div>

                                                {activePreviewInstance.mixRules.length > 0 && (
                                                    <div className="space-y-1">
                                                        {activePreviewInstance.mixRules.map((rule, index) => (
                                                            <div
                                                                key={`${activePreviewInstance.id}-mix-${index}-${rule.from}-${rule.to}`}
                                                                className="flex items-center justify-between rounded-md bg-slate-100 px-2 py-1.5 font-mono text-[10px] text-slate-600 dark:bg-[#1b2029] dark:text-zinc-300">
                                                                <span className="min-w-0 flex-1 truncate">
                                                                    {rule.from} → {rule.to}
                                                                </span>
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    max={5}
                                                                    step={0.05}
                                                                    value={rule.duration}
                                                                    onChange={(event) => handleUpdatePreviewMixRule(index, parseFloat(event.target.value) || 0)}
                                                                    className="mx-1.5 w-14 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-center font-mono text-[10px] text-slate-700 focus:outline-none focus:border-[#7d6df7] dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200"
                                                                />
                                                                <span className="mr-1 text-slate-400">s</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRemovePreviewMixRule(index)}
                                                                    className="ml-1 text-red-500 hover:text-red-600 cursor-pointer">
                                                                    ✕
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                                                        Animation Sequence
                                                    </span>
                                                    <button
                                                        type="button"
                                                        disabled={!activePreviewInstance.currentAnimation}
                                                        onClick={handleAddCurrentAnimationToSequence}
                                                        className="px-2 py-1 rounded-lg bg-[#7d6df7]/10 text-[10px] font-bold text-[#6d57f3] hover:bg-[#7d6df7]/18 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer dark:text-[#d1c9ff]">
                                                        + Add
                                                    </button>
                                                </div>

                                                {activePreviewInstance.sequence.length > 0 ? (
                                                    <div className="space-y-1.5">
                                                        {activePreviewInstance.sequence.map((animation, index) => (
                                                            <div
                                                                key={`${activePreviewInstance.id}-sequence-${index}-${animation}`}
                                                                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-200">
                                                                <span className="font-mono text-slate-400 dark:text-zinc-500">
                                                                    {index + 1}
                                                                </span>
                                                                <span className="min-w-0 flex-1 truncate">
                                                                    {animation}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRemoveSequenceItem(index)}
                                                                    className="text-slate-400 hover:text-red-500 dark:hover:text-red-300 cursor-pointer"
                                                                    aria-label={`Remove sequence item ${animation}`}>
                                                                    ×
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="rounded-xl border border-dashed border-slate-200 px-3 py-3 text-[11px] text-slate-500 dark:border-white/5 dark:text-zinc-400">
                                                        Chưa có animation sequence.
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-2 gap-2">
                                                    <button
                                                        type="button"
                                                        disabled={activePreviewInstance.sequence.length === 0}
                                                        onClick={handlePlaySequence}
                                                        className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all ${
                                                            activePreviewInstance.sequence.length === 0
                                                                ? "bg-slate-100 text-slate-400 dark:bg-zinc-800 dark:text-zinc-600 cursor-not-allowed"
                                                                : "bg-[#7d6df7] text-white hover:bg-[#9387ff] cursor-pointer"
                                                        }`}>
                                                        Play Sequence
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={activePreviewInstance.sequence.length === 0}
                                                        onClick={handleClearSequence}
                                                        className={`px-3 py-2 rounded-xl border text-[11px] font-bold transition-all ${
                                                            activePreviewInstance.sequence.length === 0
                                                                ? "border-slate-200 bg-slate-50 text-slate-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-600 cursor-not-allowed"
                                                                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-200 dark:hover:bg-[#232938] cursor-pointer"
                                                        }`}>
                                                        Clear
                                                    </button>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={handleToggleLoopLast}
                                                    className={`w-full px-3 py-2 rounded-xl border text-[11px] font-bold transition-all cursor-pointer ${
                                                        activePreviewInstance.loopLast
                                                            ? "border-[#7d6df7]/35 bg-[#7d6df7]/10 text-[#6d57f3] dark:text-[#d1c9ff]"
                                                            : "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-200"
                                                    }`}>
                                                    Loop Last {activePreviewInstance.loopLast ? "On" : "Off"}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                </div>

                                <div className="space-y-3 xl:order-1">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 font-mono">
                                                Animation Preview
                                            </h3>
                                            <p className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
                                                Drop một hoặc nhiều spine vào cùng khung preview.
                                            </p>
                                        </div>
                                        <span className="shrink-0 rounded-full bg-[#7d6df7]/10 px-2.5 py-1 text-[11px] font-bold text-[#6d57f3] dark:text-[#c2b7ff]">
                                            {filteredResults.length} spine
                                        </span>
                                    </div>

                                    <div
                                        onDragOver={handlePreviewDragOver}
                                        onDragLeave={(event) => {
                                            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                                                setDropActive(false);
                                            }
                                        }}
                                        onDrop={handlePreviewDrop}
                                        onPointerDown={handlePreviewPointerDown}
                                        onPointerMove={handlePreviewPointerMove}
                                        onPointerUp={handlePreviewPointerEnd}
                                        onPointerCancel={handlePreviewPointerEnd}
                                        onContextMenu={handlePreviewContextMenu}
                                        className={`relative min-h-[620px] overflow-hidden rounded-2xl border bg-slate-100 dark:bg-[#161a22] transition-all cursor-move ${
                                            dropActive
                                                ? "border-[#9b8cff] shadow-[inset_0_0_0_2px_rgba(125,109,247,0.28)]"
                                                : "border-slate-200 dark:border-white/5"
                                        }`}
                                        style={backgroundMode === "color" ? { backgroundColor } : undefined}>
                                        {backgroundMode === "theme" && (
                                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(125,109,247,0.16),transparent_56%)]" />
                                        )}
                                        {backgroundMode === "checker" && (
                                            <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.16)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.16)_75%,rgba(255,255,255,0.16)),linear-gradient(45deg,rgba(255,255,255,0.16)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.16)_75%,rgba(255,255,255,0.16))] bg-[length:28px_28px] bg-[position:0_0,14px_14px] bg-[#3f4858]" />
                                        )}
                                        <div
                                            ref={previewViewportRef}
                                            className="absolute inset-0"
                                        />
                                        <div
                                            onPointerDown={(event) => event.stopPropagation()}
                                            className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-xl bg-black/60 px-2 py-2 backdrop-blur">
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setBackgroundMode("theme")}
                                                    title="Theme background"
                                                    aria-label="Theme background"
                                                    className={`relative h-[34px] w-[34px] overflow-hidden rounded-[10px] border transition-all cursor-pointer ${
                                                        backgroundMode === "theme"
                                                            ? "border-[#d7d0ff] shadow-[0_0_0_2px_#d7d0ff]"
                                                            : "border-white/10 hover:-translate-y-[1px]"
                                                    }`}>
                                                    <span className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(125,109,247,0.18),transparent_58%)] dark:bg-[radial-gradient(circle_at_top,rgba(125,109,247,0.16),transparent_58%)]" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setBackgroundMode("checker")}
                                                    title="Checker background"
                                                    aria-label="Checker background"
                                                    className={`relative h-[34px] w-[34px] overflow-hidden rounded-[10px] border transition-all cursor-pointer ${
                                                        backgroundMode === "checker"
                                                            ? "border-[#d7d0ff] shadow-[0_0_0_2px_#d7d0ff]"
                                                            : "border-white/10 hover:-translate-y-[1px]"
                                                    }`}>
                                                    <span className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.48)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.48)_75%,rgba(255,255,255,0.48)),linear-gradient(45deg,rgba(255,255,255,0.48)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.48)_75%,rgba(255,255,255,0.48))] bg-[length:16px_16px] bg-[position:0_0,8px_8px] bg-[#586274]" />
                                                </button>
                                                <label
                                                    title="Custom color background"
                                                    aria-label="Custom color background"
                                                    className={`relative h-[34px] w-[34px] overflow-hidden rounded-[10px] border transition-all cursor-pointer ${
                                                        backgroundMode === "color"
                                                            ? "border-[#d7d0ff] shadow-[0_0_0_2px_#d7d0ff]"
                                                            : "border-white/10 hover:-translate-y-[1px]"
                                                    }`}>
                                                    <span
                                                        className="absolute inset-1 rounded-[7px]"
                                                        style={{ backgroundColor }}
                                                    />
                                                    <input
                                                        type="color"
                                                        value={backgroundColor}
                                                        onChange={(event) => {
                                                            setBackgroundColor(event.target.value);
                                                            setBackgroundMode("color");
                                                        }}
                                                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                                    />
                                                </label>
                                            </div>
                                            <span className="h-6 w-px bg-white/10" />
                                            <button
                                                type="button"
                                                disabled={!activePreviewInstance?.spine}
                                                onClick={() => handlePreviewZoom(1 / 1.2)}
                                                className="flex h-6 w-6 items-center justify-center rounded-md text-sm font-bold text-white transition-all hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer">
                                                −
                                            </button>
                                            <button
                                                type="button"
                                                disabled={!activePreviewInstance?.spine}
                                                onClick={handlePreviewZoomReset}
                                                title="Reset zoom"
                                                className="px-1.5 font-mono text-[11px] tabular-nums text-zinc-200 transition-all hover:text-white disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer">
                                                {activePreviewInstance ? `${Math.round(activePreviewInstance.zoom * 100)}%` : "100%"}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={!activePreviewInstance?.spine}
                                                onClick={() => handlePreviewZoom(1.2)}
                                                className="flex h-6 w-6 items-center justify-center rounded-md text-sm font-bold text-white transition-all hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer">
                                                +
                                            </button>
                                        </div>
                                        <div
                                            onPointerDown={(event) => event.stopPropagation()}
                                            className="absolute bottom-3 left-1/2 z-10 flex w-[min(92%,520px)] -translate-x-1/2 items-center justify-center gap-2.5 rounded-xl bg-black/60 px-4 py-2.5 backdrop-blur">
                                            <button
                                                type="button"
                                                disabled={!activePreviewInstance?.spine}
                                                onPointerDown={(event) => handlePreviewStepPointerDown(event, -PREVIEW_FRAME)}
                                                title="Previous frame"
                                                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white transition-all hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 16.811c0 .864-.933 1.405-1.683.977l-7.108-4.062a1.125 1.125 0 0 1 0-1.953l7.108-4.062A1.125 1.125 0 0 1 21 8.688v8.123zM11.25 16.811c0 .864-.933 1.405-1.683.977l-7.108-4.062a1.125 1.125 0 0 1 0-1.953l7.108-4.062a1.125 1.125 0 0 1 1.683.977v8.123z" />
                                                </svg>
                                            </button>
                                            <button
                                                type="button"
                                                disabled={!activePreviewInstance?.spine}
                                                onPointerDown={(event) => event.stopPropagation()}
                                                onClick={handleTogglePreviewPaused}
                                                title={activePreviewInstance?.paused ? "Play" : "Pause"}
                                                className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#7d6df7]/85 text-white transition-all hover:bg-[#7d6df7] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer">
                                                {activePreviewInstance?.paused ? (
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                                                        <path d="M8 5v14l11-7z" />
                                                    </svg>
                                                ) : (
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                                                        <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                                                    </svg>
                                                )}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={!activePreviewInstance?.spine}
                                                onPointerDown={(event) => handlePreviewStepPointerDown(event, PREVIEW_FRAME)}
                                                title="Next frame"
                                                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white transition-all hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.688c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 0 1 0 1.953l-7.108 4.062A1.125 1.125 0 0 1 3 16.811V8.688zM12.75 8.688c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 0 1 0 1.953l-7.108 4.062a1.125 1.125 0 0 1-1.683-.977V8.688z" />
                                                </svg>
                                            </button>
                                            <button
                                                type="button"
                                                disabled={!activePreviewInstance?.spine || !activePreviewInstance?.currentAnimation}
                                                onPointerDown={(event) => event.stopPropagation()}
                                                onClick={handleTogglePreviewLoop}
                                                title={activePreviewInstance?.loop ? "Loop ON" : "Loop OFF"}
                                                className={`flex h-7 w-7 items-center justify-center rounded-lg text-white transition-all disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer ${
                                                    activePreviewInstance?.loop
                                                        ? "bg-[#7d6df7]/85 hover:bg-[#7d6df7]"
                                                        : "bg-white/10 hover:bg-white/20"
                                                }`}>
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992m0 0v-4.992m0 4.992-3.181-3.183a8.25 8.25 0 0 0-13.803 3.7M7.977 14.652H2.985m0 0v4.992m0-4.992 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7" />
                                                </svg>
                                            </button>
                                            <label className="flex items-center gap-2 font-mono text-[11px] text-zinc-300" title="Playback speed">
                                                Speed {activePreviewInstance ? activePreviewInstance.speed.toFixed(1) : "1.0"}x
                                                <input
                                                    type="range"
                                                    min={0}
                                                    max={2}
                                                    step={0.1}
                                                    value={activePreviewInstance?.speed ?? 1}
                                                    disabled={!activePreviewInstance?.spine}
                                                    onChange={(event) => handlePreviewSpeed(parseFloat(event.target.value))}
                                                    className="w-24 accent-[#7d6df7] disabled:opacity-40 cursor-pointer"
                                                />
                                            </label>
                                        </div>
                                        {previewInstances.length === 0 && (
                                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center">
                                                <div>
                                                    <div className="text-sm font-bold text-slate-600 dark:text-zinc-200">
                                                        Drop spine here
                                                    </div>
                                                    <div className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                                                        Highlight nhiều spine ở list rồi kéo vào đây một lần.
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {inlinePreviewError && (
                                            <div className="absolute left-4 top-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-300">
                                                {inlinePreviewError}
                                            </div>
                                        )}
                                        {spinePopover && popoverPreviewInstance && (
                                            <div
                                                onPointerDown={(event) => event.stopPropagation()}
                                                onContextMenu={(event) => event.preventDefault()}
                                                className="absolute z-20 w-[220px] rounded-xl border border-zinc-700 bg-zinc-950 p-2 shadow-2xl"
                                                style={{ left: spinePopover.x, top: spinePopover.y }}>
                                                <div className="mb-2 min-w-0 truncate px-2 text-[11px] font-bold text-zinc-100">
                                                    {spineDisplayName(popoverPreviewInstance.item.fileName)}
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSpinePopover((current) =>
                                                            current
                                                                ? { ...current, showAnimations: !current.showAnimations }
                                                                : current
                                                        )}
                                                        className="rounded-lg bg-white/10 px-2 py-2 text-[11px] font-bold text-zinc-100 transition-all hover:bg-white/16 cursor-pointer">
                                                        Anim
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => removePreviewInstance(popoverPreviewInstance.id)}
                                                        className="rounded-lg border border-red-400/30 bg-red-500/12 px-2 py-2 text-[11px] font-bold text-red-200 transition-all hover:bg-red-500/20 cursor-pointer">
                                                        Clear
                                                    </button>
                                                </div>
                                                {spinePopover.showAnimations && (
                                                    <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-2">
                                                        {popoverPreviewInstance.item.animations.length > 0 ? (
                                                            popoverPreviewInstance.item.animations.map((animation) => (
                                                                <button
                                                                    key={`${popoverPreviewInstance.id}-popover-${animation}`}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        if (!popoverPreviewInstance.spine) return;
                                                                        SpineStage.playAnimation(popoverPreviewInstance.spine, animation, popoverPreviewInstance.loop);
                                                                        popoverPreviewInstance.spine.state.timeScale = popoverPreviewInstance.paused ? 0 : popoverPreviewInstance.speed;
                                                                        updatePreviewInstance(popoverPreviewInstance.id, { currentAnimation: animation });
                                                                    }}
                                                                    className="block w-full rounded-md bg-zinc-800 px-2 py-1.5 text-left text-[10px] font-semibold text-zinc-200 transition-all hover:bg-zinc-700 cursor-pointer">
                                                                    <span className="block whitespace-normal break-words">{animation}</span>
                                                                </button>
                                                            ))
                                                        ) : (
                                                            <div className="text-[10px] font-semibold text-zinc-500">
                                                                No animations
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {previewInstances.length > 0 && (
                                        <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/5 dark:bg-zinc-900">
                                            <div className="mb-2 flex items-center justify-between gap-3">
                                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 font-mono">
                                                    Preview Stack
                                                </h3>
                                                <button
                                                    type="button"
                                                    onClick={clearInlinePreview}
                                                    className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-600 transition-all hover:bg-red-100 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/15 cursor-pointer">
                                                    Clear Preview
                                                </button>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {previewInstances.map((instance) => (
                                                    <button
                                                        key={instance.id}
                                                        type="button"
                                                        onClick={() => setActivePreviewInstanceId(instance.id)}
                                                        className={`group inline-flex max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-all cursor-pointer ${
                                                            activePreviewInstanceId === instance.id
                                                                ? "border-[#7d6df7]/55 bg-[#7d6df7]/14 text-[#5c46ff] dark:text-[#d1c9ff]"
                                                                : "border-slate-200 bg-slate-50 text-slate-600 hover:border-[#7d6df7]/35 dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-300"
                                                        }`}>
                                                        <span className="min-w-0 truncate">
                                                            {spineDisplayName(instance.item.fileName)}
                                                        </span>
                                                        {instance.loading && (
                                                            <span className="shrink-0 font-mono text-[10px] text-slate-400">loading</span>
                                                        )}
                                                        {instance.error && (
                                                            <span className="shrink-0 font-mono text-[10px] text-red-500">error</span>
                                                        )}
                                                        <span
                                                            role="button"
                                                            tabIndex={0}
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                removePreviewInstance(instance.id);
                                                            }}
                                                            onKeyDown={(event) => {
                                                                if (event.key === "Enter" || event.key === " ") {
                                                                    event.preventDefault();
                                                                    event.stopPropagation();
                                                                    removePreviewInstance(instance.id);
                                                                }
                                                            }}
                                                            className="shrink-0 rounded-md px-1 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500"
                                                            aria-label={`Remove ${spineDisplayName(instance.item.fileName)}`}>
                                                            ×
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
