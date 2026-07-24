// src/components/SpinePreviewModal.tsx
import { useEffect, useRef, useState } from "react";
import { Spine } from "pixi-spine";
import { SpineStage } from "../spine/SpineStage";

export interface SpineResult {
    fileName: string;
    slots: number;
    atlasPages: number;
    estDrawcall: number;
    jsonPath: string;
    atlasPath: string;
    pngPaths: string[];
    version: string;
    animations: string[];
    skins: string[];
    validationErrors?: string[];
}

interface Props {
    item: SpineResult;
    onClose: () => void;
    onNext?: () => void;
    onPrev?: () => void;
    hasNext?: boolean;
    hasPrev?: boolean;
}

/** Format seconds with two decimals, e.g. 1.50. */
function formatTime(seconds: number): string {
    return seconds.toFixed(2);
}

const ZOOM_STEP = 1.2;

export default function SpinePreviewModal({ item, onClose, onNext, onPrev, hasNext, hasPrev }: Props) {
    const [backgroundMode, setBackgroundMode] = useState<"transparent" | "checker">("transparent");
    const [expanded, setExpanded] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<SpineStage | null>(null);
    const singleSpineRef = useRef<Spine | null>(null);
    // Active sequence tracking: per-step durations + running step index, so the
    // timer can show cumulative time across the whole selected sequence.
    const seqRef = useRef<{ durations: number[]; total: number } | null>(null);
    const seqStepRef = useRef(0);
    const disposeCompleteRef = useRef<(() => void) | null>(null);

    const [loadError, setLoadError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [paused, setPaused] = useState(false);
    const [timeScale, setTimeScale] = useState(1);
    const [zoom, setZoom] = useState(1);

    const [currentAnim, setCurrentAnim] = useState<string>("");
    const [currentSkin, setCurrentSkin] = useState<string>("");
    const [loop, setLoop] = useState(true);
    const [loopLast, setLoopLast] = useState(true);
    const [sequence, setSequence] = useState<string[]>([]);
    // Mix configuration
    const [defaultMix, setDefaultMix] = useState(0);
    const [mixRules, setMixRules] = useState<Array<{ from: string; to: string; duration: number }>>([]);
    const [mixFrom, setMixFrom] = useState("");
    const [mixTo, setMixTo] = useState("");
    // Live playback timing: current track time + total duration in seconds.
    const [elapsed, setElapsed] = useState(0);
    const [duration, setDuration] = useState(0);

    // Scrubbing state. elapsedRef mirrors `elapsed` for synchronous reads (the
    // ticker is stopped while scrubbing, so state alone can lag rapid steps).
    const elapsedRef = useRef(0);
    const scrubbingRef = useRef(false);
    const wasPlayingRef = useRef(false);
    const barRef = useRef<HTMLDivElement>(null);
    const [isScrubbing, setIsScrubbing] = useState(false);

    // Build the stage + load the spine once on mount.
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        let cancelled = false;
        const stage = new SpineStage(container, {
            backgroundColor: 0x000000,
            backgroundAlpha: 0,
        });
        stageRef.current = stage;

        // Keyboard navigation for next/prev spine
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            if (e.key === 'ArrowLeft' && hasPrev && onPrev) {
                e.preventDefault();
                onPrev();
            } else if (e.key === 'ArrowRight' && hasNext && onNext) {
                e.preventDefault();
                onNext();
            } else if (e.key === 'Escape' && expanded) {
                e.preventDefault();
                setExpanded(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        (async () => {
            try {
                const spine = await stage.loadSpine({
                    jsonPath: item.jsonPath,
                    atlasPath: item.atlasPath,
                });
                if (cancelled) return;
                singleSpineRef.current = spine;
                stage.fitToView(spine);
                setZoom(stage.currentZoom);
                // Apply an initial skin if the spine defines named skins.
                if (item.skins.length > 0) {
                    const initialSkin = item.skins.includes("default") ? "default" : item.skins[0];
                    SpineStage.setSkin(spine, initialSkin);
                    setCurrentSkin(initialSkin);
                }
                const first = SpineStage.animationNames(spine)[0];
                if (first) {
                    SpineStage.playAnimation(spine, first, true);
                    setCurrentAnim(first);
                }
                // Live playback timer driven by the shared ticker. When a sequence
                // is active, show CUMULATIVE time across all selected animations;
                // otherwise show the single animation's per-loop time.
                stage.app.ticker.add(() => {
                    // While the user is dragging the scrubber we own the time; the
                    // ticker must not overwrite elapsed with live playback.
                    if (scrubbingRef.current) return;
                    const p = SpineStage.currentPlayback(spine);
                    if (p.name) setCurrentAnim(p.name);
                    const seq = seqRef.current;
                    if (seq) {
                        const before = seq.durations
                            .slice(0, seqStepRef.current)
                            .reduce((s, d) => s + d, 0);
                        const e = Math.min(before + p.elapsed, seq.total);
                        elapsedRef.current = e;
                        setElapsed(e);
                        setDuration(seq.total);
                    } else {
                        elapsedRef.current = p.elapsed;
                        setElapsed(p.elapsed);
                        setDuration(p.duration);
                    }
                });
                setIsLoading(false);
            } catch (e) {
                if (cancelled) return;
                setLoadError(e instanceof Error ? e.message : "Failed to load spine");
                setIsLoading(false);
            }
        })();

        return () => {
            cancelled = true;
            window.removeEventListener('keydown', handleKeyDown);
            stage.destroy();
            stageRef.current = null;
            singleSpineRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasNext, hasPrev, onNext, onPrev, expanded]);

    // Wheel-to-zoom over the canvas.
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const stage = stageRef.current;
            if (!stage) return;
            const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
            setZoom(stage.zoomBy(factor));
        };
        container.addEventListener("wheel", onWheel, { passive: false });
        return () => container.removeEventListener("wheel", onWheel);
    }, []);

    // Leave sequence mode: drop the listener + tracking so the timer reverts to
    // per-animation timing.
    const clearActiveSequence = () => {
        disposeCompleteRef.current?.();
        disposeCompleteRef.current = null;
        seqRef.current = null;
        seqStepRef.current = 0;
    };

    // Clear any paused/scrubbing state and resume the ticker. Call after starting
    // a fresh playback (select anim / play sequence) so a prior Pause doesn't
    // leave the stage frozen.
    const forceResume = () => {
        scrubbingRef.current = false;
        setIsScrubbing(false);
        setPaused(false);
        stageRef.current?.setPaused(false);
    };

    const handleSelectAnim = (name: string) => {
        const spine = singleSpineRef.current;
        if (!spine) return;
        clearActiveSequence();
        setCurrentAnim(name);
        SpineStage.playAnimation(spine, name, loop);
        setDuration(SpineStage.animationDuration(spine, name));
        setElapsed(0);
        elapsedRef.current = 0;
        forceResume();
    };

    const handleToggleLoop = (next: boolean) => {
        setLoop(next);
        const spine = singleSpineRef.current;
        if (spine && currentAnim) {
            clearActiveSequence();
            SpineStage.playAnimation(spine, currentAnim, next);
        }
    };

    const handleSelectSkin = (name: string) => {
        const spine = singleSpineRef.current;
        if (!spine) return;
        setCurrentSkin(name);
        SpineStage.setSkin(spine, name);
        // Changing skin resets to setup pose, so replay the current animation.
        if (currentAnim) SpineStage.playAnimation(spine, currentAnim, loop);
    };

    const handlePauseToggle = () => {
        const next = !paused;
        const spine = singleSpineRef.current;
        const stage = stageRef.current;

        if (next) {
            // Pause: just pause the stage
            setPaused(true);
            stageRef.current?.setPaused(true);
        } else {
            // Play/Restart: re-play current animation from beginning
            setPaused(false);
            if (spine && currentAnim) {
                const seq = seqRef.current;
                if (seq) {
                    // Restart sequence from step 0
                    seqStepRef.current = 0;
                    elapsedRef.current = 0;
                    setElapsed(0);
                    SpineStage.playSequence(spine, sequence, loopLast);
                } else {
                    // Restart single animation
                    elapsedRef.current = 0;
                    setElapsed(0);
                    SpineStage.playAnimation(spine, currentAnim, loop);
                }
            }
            stage?.setPaused(false);
        }
    };

    const handleTimeScale = (value: number) => {
        setTimeScale(value);
        stageRef.current?.setTimeScale(value);
    };

    const handleZoom = (factor: number) => {
        const stage = stageRef.current;
        if (!stage) return;
        setZoom(stage.zoomBy(factor));
    };

    const handleZoomReset = () => {
        const stage = stageRef.current;
        if (!stage) return;
        setZoom(stage.setZoom(1));
    };

    const handleAddToSequence = (name: string) => setSequence(prev => [...prev, name]);
    const handleRemoveFromSequence = (index: number) =>
        setSequence(prev => prev.filter((_, i) => i !== index));
    const handleClearSequence = () => setSequence([]);

    const handlePlaySequence = () => {
        const spine = singleSpineRef.current;
        const stage = stageRef.current;
        if (!spine || !stage || sequence.length === 0) return;
        clearActiveSequence();
        // Precompute each step's duration and the grand total.
        const durations = sequence.map(n => SpineStage.animationDuration(spine, n));
        const total = durations.reduce((sum, d) => sum + d, 0);
        seqRef.current = { durations, total };
        seqStepRef.current = 0;
        // Advance the step on each "complete" so the cumulative timer knows how
        // much of the sequence is behind the currently-playing animation.
        disposeCompleteRef.current = SpineStage.onComplete(spine, () => {
            seqStepRef.current = Math.min(seqStepRef.current + 1, sequence.length - 1);
        });
        SpineStage.playSequence(spine, sequence, loopLast);
        setCurrentAnim(sequence[0]);
        setDuration(total);
        setElapsed(0);
        elapsedRef.current = 0;
        // Always restart playback from the top — clear any paused/scrubbing state
        // so the ticker resumes (otherwise a prior Pause leaves the stage frozen).
        forceResume();
    };

    // Map a global elapsed time to {stepIndex, localTime}. Without a sequence the
    // step is 0 and localTime === global time.
    const resolveSeek = (global: number): { step: number; local: number } => {
        const seq = seqRef.current;
        if (!seq) return { step: 0, local: global };
        let remaining = global;
        for (let i = 0; i < seq.durations.length; i++) {
            const d = seq.durations[i];
            if (remaining <= d || i === seq.durations.length - 1) {
                return { step: i, local: Math.max(0, Math.min(remaining, d)) };
            }
            remaining -= d;
        }
        return { step: 0, local: global };
    };

    // Seek to a global time and draw that frame. Pauses playback (scrubbing is a
    // paused operation); the user can hit Play to resume from there.
    const seekTo = (global: number) => {
        const spine = singleSpineRef.current;
        const stage = stageRef.current;
        if (!spine || !stage) return;

        const clamped = Math.max(0, Math.min(global, duration));
        const { step, local } = resolveSeek(clamped);

        const seq = seqRef.current;
        if (seq) {
            // Re-pin the active step so the cumulative timer stays correct, then
            // bind just that step's animation so we can pose it at `local`.
            seqStepRef.current = step;
            SpineStage.playAnimation(spine, sequence[step], false);
        }
        SpineStage.seek(spine, local);
        stage.setPaused(true);
        stage.renderOnce();

        elapsedRef.current = clamped;
        setElapsed(clamped);
        if (!paused) setPaused(true);
    };

    // Resume continuous playback from the currently-displayed time. In sequence
    // mode this rebuilds the native queue from the active step + offset.
    const resumePlayback = () => {
        const spine = singleSpineRef.current;
        const stage = stageRef.current;
        if (!spine || !stage) {
            stageRef.current?.setPaused(false);
            return;
        }
        const seq = seqRef.current;
        if (seq) {
            const { step, local } = resolveSeek(elapsedRef.current);
            seqStepRef.current = step;
            SpineStage.playSequenceFrom(spine, sequence, step, local, loopLast);
        } else {
            SpineStage.seek(spine, elapsedRef.current);
        }
        stage.setPaused(false);
    };

    // Step by a fixed delta (seconds). Frame-by-frame uses 1/60s.
    const FRAME = 1 / 60;
    const stepBy = (delta: number) => {
        seekTo(elapsedRef.current + delta);
    };

    // Pointer-driven scrubbing on the progress bar.
    const timeFromPointer = (clientX: number): number => {
        const bar = barRef.current;
        if (!bar || duration <= 0) return 0;
        const rect = bar.getBoundingClientRect();
        const ratio = (clientX - rect.left) / rect.width;
        return Math.max(0, Math.min(1, ratio)) * duration;
    };

    const handleScrubStart = (e: React.PointerEvent<HTMLDivElement>) => {
        if (duration <= 0) return;
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        wasPlayingRef.current = !paused;
        scrubbingRef.current = true;
        setIsScrubbing(true);
        seekTo(timeFromPointer(e.clientX));
    };

    const handleScrubMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!scrubbingRef.current) return;
        seekTo(timeFromPointer(e.clientX));
    };

    const handleScrubEnd = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!scrubbingRef.current) return;
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
        scrubbingRef.current = false;
        setIsScrubbing(false);
        // Resume only if playback was running before the drag started.
        if (wasPlayingRef.current) {
            setPaused(false);
            resumePlayback();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-[90vw] h-[90vh] bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-zinc-700">
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onPrev}
                            disabled={!hasPrev}
                            title="Previous spine (Left Arrow)"
                            className="w-8 h-8 flex items-center justify-center text-sm font-bold rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
                            ◀
                        </button>
                        <button
                            type="button"
                            onClick={onNext}
                            disabled={!hasNext}
                            title="Next spine (Right Arrow)"
                            className="w-8 h-8 flex items-center justify-center text-sm font-bold rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
                            ▶
                        </button>
                    </div>
                    <div className="text-left min-w-0 flex-1 mx-3">
                        <h3 className="text-sm font-bold text-[#9b8cff] truncate">
                            {item.fileName}
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
                            Spine v{item.version} · {item.slots} slots · est. Drawcall {item.estDrawcall}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setExpanded(!expanded)}
                        title={expanded ? "Show controls (ESC)" : "Expand view (hide controls)"}
                        className="w-8 h-8 flex items-center justify-center text-slate-600 dark:text-zinc-300 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-all cursor-pointer">
                        {expanded ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M15 9h4.5M15 9V4.5M15 9l5.25-5.25M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 15l5.25 5.25M15 15v4.5M15 15h4.5" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0l5.25 5.25M20.25 3.75h-4.5m4.5 0v4.5m0-4.5l-5.25 5.25M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0l5.25-5.25M20.25 20.25h-4.5m4.5 0v-4.5m0 4.5l-5.25-5.25" />
                            </svg>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        title="Close (Esc)"
                        className="w-8 h-8 flex items-center justify-center text-red-500 dark:text-red-400 rounded-lg bg-red-500/10 dark:bg-red-500/20 border-2 border-red-500/30 dark:border-red-500/40 hover:bg-red-500 hover:text-white hover:border-red-500 dark:hover:bg-red-500 dark:hover:text-white dark:hover:border-red-500 transition-all cursor-pointer ml-1.5">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body: canvas + controls */}
                <div className="flex-1 flex min-h-0">
                    {/* Canvas area */}
                    <div
                        className={`flex-1 relative min-w-0 ${
                            backgroundMode === "checker"
                                ? "bg-[linear-gradient(45deg,rgba(255,255,255,0.4)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.4)_75%,rgba(255,255,255,0.4)),linear-gradient(45deg,rgba(255,255,255,0.4)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.4)_75%,rgba(255,255,255,0.4))] bg-[length:24px_24px] bg-[position:0_0,12px_12px] bg-[#586274]"
                                : "bg-slate-100 dark:bg-[#161a22]"
                        }`}>
                        <div ref={containerRef} className="w-full h-full" />
                        {isLoading && (
                            <div className="absolute inset-0 flex items-center justify-center text-zinc-400 text-xs font-mono">
                                Loading spine...
                            </div>
                        )}
                        {loadError && (
                            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-red-400 text-xs font-mono">
                                {loadError}
                            </div>
                        )}

                        {/* Animation selector for expanded mode - top left */}
                        {expanded && (
                            <div className="absolute top-3 left-3">
                                <select
                                    value={currentAnim}
                                    onChange={(e) => handleSelectAnim(e.target.value)}
                                    className="px-3 py-2 rounded-xl bg-black/70 backdrop-blur-md border border-[#7d6df7]/40 text-[12px] text-[#e0d9ff] font-mono font-semibold focus:outline-none focus:border-[#9b8cff] focus:ring-2 focus:ring-[#7d6df7]/20 cursor-pointer hover:bg-black/80 hover:border-[#9b8cff]/70 transition-all shadow-lg">
                                    {item.animations.map(a => (
                                        <option key={a} value={a} className="bg-zinc-800 text-zinc-100">{a}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Background + zoom controls (top-right) */}
                        <div className="absolute top-3 right-3 flex items-center gap-2 px-2 py-1.5 rounded-xl bg-black/60 backdrop-blur">
                            <div className="flex items-center gap-2 rounded-lg bg-white/5 p-1.5">
                                <button
                                    type="button"
                                    onClick={() => setBackgroundMode("transparent")}
                                    title="Use app theme background"
                                    aria-label="Use app theme background"
                                    className={`relative h-[34px] w-[34px] overflow-hidden rounded-[10px] border transition-all cursor-pointer ${
                                        backgroundMode === "transparent"
                                            ? "border-[#d7d0ff] shadow-[0_0_0_2px_#d7d0ff]"
                                            : "border-white/10 hover:-translate-y-[1px]"
                                    }`}>
                                    <span className="absolute inset-0 bg-slate-100 dark:bg-[#161a22]" />
                                    <span className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(125,109,247,0.18),transparent_58%)] dark:bg-[radial-gradient(circle_at_top,rgba(125,109,247,0.16),transparent_58%)]" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setBackgroundMode("checker")}
                                    title="Use checker background"
                                    aria-label="Use checker background"
                                    className={`relative h-[34px] w-[34px] overflow-hidden rounded-[10px] border transition-all cursor-pointer ${
                                        backgroundMode === "checker"
                                            ? "border-[#d7d0ff] shadow-[0_0_0_2px_#d7d0ff]"
                                            : "border-white/10 hover:-translate-y-[1px]"
                                    }`}>
                                    <span className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.48)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.48)_75%,rgba(255,255,255,0.48)),linear-gradient(45deg,rgba(255,255,255,0.48)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.48)_75%,rgba(255,255,255,0.48))] bg-[length:16px_16px] bg-[position:0_0,8px_8px] bg-[#586274]" />
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleZoom(1 / ZOOM_STEP)}
                                className="w-6 h-6 flex items-center justify-center text-sm font-bold text-white rounded-md hover:bg-white/15 transition-all cursor-pointer">
                                −
                            </button>
                            <button
                                type="button"
                                onClick={handleZoomReset}
                                title="Reset zoom"
                                className="px-1.5 text-[11px] text-zinc-200 font-mono tabular-nums hover:text-white transition-all cursor-pointer">
                                {Math.round(zoom * 100)}%
                            </button>
                            <button
                                type="button"
                                onClick={() => handleZoom(ZOOM_STEP)}
                                className="w-6 h-6 flex items-center justify-center text-sm font-bold text-white rounded-md hover:bg-white/15 transition-all cursor-pointer">
                                +
                            </button>
                        </div>

                        {/* Global playback controls */}
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[min(92%,560px)] flex flex-col items-center gap-2 px-4 py-2.5 rounded-xl bg-black/60 backdrop-blur">
                            <div className="flex items-center gap-2.5">
                                <button
                                    type="button"
                                    onClick={() => stepBy(-FRAME)}
                                    title="Previous frame (←)"
                                    className="w-7 h-7 flex items-center justify-center text-white rounded-lg bg-white/10 hover:bg-white/20 transition-all cursor-pointer">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 16.811c0 .864-.933 1.405-1.683.977l-7.108-4.062a1.125 1.125 0 010-1.953l7.108-4.062A1.125 1.125 0 0121 8.688v8.123zM11.25 16.811c0 .864-.933 1.405-1.683.977l-7.108-4.062a1.125 1.125 0 010-1.953l7.108-4.062a1.125 1.125 0 011.683.977v8.123z" />
                                    </svg>
                                </button>
                                <button
                                    type="button"
                                    onClick={handlePauseToggle}
                                    title={paused ? "Play (Space)" : "Pause (Space)"}
                                    className="w-7 h-7 flex items-center justify-center text-white rounded-lg bg-[#7d6df7]/85 hover:bg-[#7d6df7] transition-all cursor-pointer">
                                    {paused ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z" />
                                        </svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                                        </svg>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => stepBy(FRAME)}
                                    title="Next frame (→)"
                                    className="w-7 h-7 flex items-center justify-center text-white rounded-lg bg-white/10 hover:bg-white/20 transition-all cursor-pointer">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.688c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062A1.125 1.125 0 013 16.811V8.688zM12.75 8.688c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062a1.125 1.125 0 01-1.683-.977V8.688z" />
                                    </svg>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleToggleLoop(!loop)}
                                    title={loop ? "Loop ON (click to disable)" : "Loop OFF (click to enable)"}
                                    className={`w-7 h-7 flex items-center justify-center text-white rounded-lg transition-all cursor-pointer ${
                                        loop ? "bg-[#7d6df7]/85 hover:bg-[#7d6df7]" : "bg-white/10 hover:bg-white/20"
                                    }`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                    </svg>
                                </button>
                                <label className="flex items-center gap-2 text-[11px] text-zinc-300 font-mono" title="Playback speed">
                                    Speed {timeScale.toFixed(1)}x
                                    <input
                                        type="range"
                                        min={0}
                                        max={2}
                                        step={0.1}
                                        value={timeScale}
                                        onChange={(e) => handleTimeScale(parseFloat(e.target.value))}
                                        className="w-20 accent-[#7d6df7] cursor-pointer"
                                    />
                                </label>
                                <span className="text-[11px] text-[#d2caff] font-mono tabular-nums">
                                    {formatTime(elapsed)} / {formatTime(duration)}s
                                </span>
                            </div>
                            {/* Scrubbable progress bar. Hit area is taller than the
                                visible track for easier grabbing. */}
                            <div
                                ref={barRef}
                                onPointerDown={handleScrubStart}
                                onPointerMove={handleScrubMove}
                                onPointerUp={handleScrubEnd}
                                onPointerCancel={handleScrubEnd}
                                className={`group relative w-full py-2 ${duration > 0 ? "cursor-pointer" : "cursor-default"}`}
                                style={{ touchAction: "none" }}>
                                <div className="w-full h-1.5 rounded-full bg-zinc-600/60 overflow-hidden">
                                    <div
                                        className="h-full bg-[#8f80ff]"
                                        style={{ width: `${duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0}%` }}
                                    />
                                </div>
                                {/* Draggable handle */}
                                {duration > 0 && (
                                    <div
                                        className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[#d2caff] border border-[#7d6df7] shadow transition-transform ${isScrubbing ? "scale-125" : "group-hover:scale-110"}`}
                                        style={{ left: `${Math.min(100, (elapsed / duration) * 100)}%` }}
                                    />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Side panel */}
                    {!expanded && (
                    <div className="w-72 border-l border-slate-200 dark:border-zinc-700 p-4 overflow-y-auto space-y-5 bg-slate-50 dark:bg-zinc-900">
                        {/* Animation dropdown */}
                        <div className="space-y-2">
                            <label className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                                <span>Play animation</span>
                                {duration > 0 && (
                                    <span className="text-[#9b8cff] font-mono normal-case">{formatTime(duration)}s</span>
                                )}
                            </label>
                            <select
                                value={currentAnim}
                                onChange={(e) => handleSelectAnim(e.target.value)}
                                className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 focus:outline-none focus:border-[#7d6df7] cursor-pointer">
                                {item.animations.map(a => (
                                    <option key={a} value={a}>{a}</option>
                                ))}
                            </select>
                        </div>

                        {/* Skin dropdown (only when the spine has multiple skins) */}
                        {item.skins.length > 1 && (
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                                    Skin
                                </label>
                                <select
                                    value={currentSkin}
                                    onChange={(e) => handleSelectSkin(e.target.value)}
                                    className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 focus:outline-none focus:border-[#7d6df7] cursor-pointer">
                                    {item.skins.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Mix Config */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                                Animation Mix (Crossfade)
                            </label>
                            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-2 items-center">
                                <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-mono">Default</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={5}
                                    step={0.05}
                                    value={defaultMix}
                                    onChange={(e) => {
                                        const v = parseFloat(e.target.value) || 0;
                                        setDefaultMix(v);
                                        const spine = singleSpineRef.current;
                                        if (spine) SpineStage.setDefaultMix(spine, v);
                                    }}
                                    className="w-full px-2 py-1.5 text-xs rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 focus:outline-none focus:border-[#7d6df7] font-mono"
                                />
                            </div>
                            {/* Add custom rule */}
                            <div className="flex gap-1.5 items-end">
                                <select
                                    value={mixFrom}
                                    onChange={(e) => setMixFrom(e.target.value)}
                                    className="flex-1 px-2 py-1.5 text-[10px] rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 focus:outline-none focus:border-[#7d6df7] cursor-pointer">
                                    <option value="">From...</option>
                                    {item.animations.map(a => (
                                        <option key={a} value={a}>{a}</option>
                                    ))}
                                </select>
                                <span className="text-[10px] text-slate-400">→</span>
                                <select
                                    value={mixTo}
                                    onChange={(e) => setMixTo(e.target.value)}
                                    className="flex-1 px-2 py-1.5 text-[10px] rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 focus:outline-none focus:border-[#7d6df7] cursor-pointer">
                                    <option value="">To...</option>
                                    {item.animations.map(a => (
                                        <option key={a} value={a}>{a}</option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    disabled={!mixFrom || !mixTo}
                                    onClick={() => {
                                        if (!mixFrom || !mixTo) return;
                                        const dur = defaultMix || 0.2;
                                        const spine = singleSpineRef.current;
                                        if (spine) SpineStage.setMix(spine, mixFrom, mixTo, dur);
                                        setMixRules(prev => [...prev, { from: mixFrom, to: mixTo, duration: dur }]);
                                        setMixFrom("");
                                        setMixTo("");
                                    }}
                                    className={`px-2 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                                        !mixFrom || !mixTo
                                            ? "opacity-40 cursor-not-allowed bg-slate-200 dark:bg-zinc-800 text-slate-400"
                                            : "bg-[#7d6df7] text-white hover:bg-[#9387ff] cursor-pointer"
                                    }`}>
                                    + Add
                                </button>
                            </div>
                            {/* Rules list */}
                            {mixRules.length > 0 && (
                                <div className="space-y-1 mt-1">
                                    {mixRules.map((rule, i) => (
                                        <div key={i} className="flex items-center justify-between text-[10px] font-mono px-2 py-1.5 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">
                                            <span className="truncate flex-1">{rule.from} → {rule.to}</span>
                                            <input
                                                type="number"
                                                min={0}
                                                max={5}
                                                step={0.05}
                                                value={rule.duration}
                                                onChange={(e) => {
                                                    const v = parseFloat(e.target.value) || 0;
                                                    const spine = singleSpineRef.current;
                                                    if (spine) SpineStage.setMix(spine, rule.from, rule.to, v);
                                                    setMixRules(prev => prev.map((r, j) => j === i ? { ...r, duration: v } : r));
                                                }}
                                                className="w-14 px-1.5 py-0.5 text-[10px] rounded bg-white dark:bg-zinc-700 border border-slate-200 dark:border-zinc-600 text-center font-mono focus:outline-none focus:border-[#7d6df7] mx-1.5"
                                            />
                                            <span className="text-slate-400 mr-1">s</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const spine = singleSpineRef.current;
                                                    if (spine) SpineStage.setMix(spine, rule.from, rule.to, defaultMix);
                                                    setMixRules(prev => prev.filter((_, j) => j !== i));
                                                }}
                                                className="text-red-500 hover:text-red-600 cursor-pointer ml-1">✕</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Sequence builder */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                                Sequence builder
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                                {item.animations.map(a => (
                                    <button
                                        key={a}
                                        type="button"
                                        onClick={() => handleAddToSequence(a)}
                                        className="px-2 py-1 text-[10px] rounded-md bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:border-amber-500 transition-all cursor-pointer">
                                        + {a}
                                    </button>
                                ))}
                            </div>
                            {sequence.length > 0 && (
                                <ol className="space-y-1 mt-2">
                                    {sequence.map((a, i) => (
                                        <li key={`${a}-${i}`} className="flex items-center justify-between text-[11px] font-mono px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400">
                                            <span className="truncate">{i + 1}. {a}</span>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveFromSequence(i)}
                                                className="ml-2 text-red-500 hover:text-red-600 cursor-pointer">✕</button>
                                        </li>
                                    ))}
                                </ol>
                            )}
                            <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-zinc-400 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={loopLast}
                                    onChange={(e) => setLoopLast(e.target.checked)}
                                    className="accent-amber-500 cursor-pointer"
                                />
                                Loop last animation
                            </label>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={handlePlaySequence}
                                    disabled={sequence.length === 0}
                                    className={`flex-1 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
                                        sequence.length === 0
                                            ? "opacity-50 cursor-not-allowed bg-slate-200 dark:bg-zinc-800 text-slate-400"
                                            : "bg-gradient-to-r from-amber-500 to-yellow-600 text-white hover:from-amber-400 hover:to-yellow-500 cursor-pointer"
                                    }`}>
                                    ▶ Play sequence
                                </button>
                                <button
                                    type="button"
                                    onClick={handleClearSequence}
                                    className="px-3 py-2 text-xs font-bold rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 transition-all cursor-pointer">
                                    Clear
                                </button>
                            </div>
                        </div>
                    </div>
                    )}
                </div>
            </div>
        </div>
    );
}
