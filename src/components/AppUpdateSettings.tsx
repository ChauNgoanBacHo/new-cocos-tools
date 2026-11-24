import { useEffect, useMemo, useState } from "react";

const INITIAL_STATE: AppUpdateState = {
    status: "idle",
    currentVersion: "0.0.0",
};

function formatBytes(value?: number) {
    if (!value || value <= 0) return "";
    const units = ["B", "KB", "MB", "GB"];
    let size = value;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }
    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function AppUpdateSettings() {
    const [state, setState] = useState<AppUpdateState>(INITIAL_STATE);
    const [actionError, setActionError] = useState("");

    useEffect(() => {
        const updater = window.electronAPI?.appUpdate;
        if (!updater) {
            setState({
                status: "disabled",
                currentVersion: "0.0.0",
                message: "Auto update is unavailable in this environment.",
            });
            return;
        }

        void updater.getState().then(setState).catch((error: unknown) => {
            setActionError(error instanceof Error ? error.message : "Unable to load update status.");
        });
        return updater.onState(setState);
    }, []);

    const statusLabel = useMemo(() => {
        switch (state.status) {
            case "checking": return "Checking";
            case "available": return `Version ${state.version} found`;
            case "downloading": return `Downloading ${Math.round(state.percent ?? 0)}%`;
            case "downloaded": return `Version ${state.version} ready`;
            case "not-available": return "Up to date";
            case "error": return "Update failed";
            case "disabled": return "Unavailable";
            default: return "Ready";
        }
    }, [state]);

    const isBusy = state.status === "checking" || state.status === "available" || state.status === "downloading";
    const progressDetail = state.status === "downloading" && state.total
        ? `${formatBytes(state.transferred)} / ${formatBytes(state.total)}`
        : "";

    const handleCheck = async () => {
        setActionError("");
        try {
            setState(await window.electronAPI.appUpdate.check());
        } catch (error: unknown) {
            setActionError(error instanceof Error ? error.message : "Unable to check for updates.");
        }
    };

    const handleInstall = async () => {
        setActionError("");
        try {
            const result = await window.electronAPI.appUpdate.install();
            if (!result.ok) setActionError(result.error || "Unable to install the update.");
        } catch (error: unknown) {
            setActionError(error instanceof Error ? error.message : "Unable to install the update.");
        }
    };

    return (
        <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5 dark:border-zinc-600">
                <svg className="h-4 w-4 text-[#7d6df7]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14" />
                </svg>
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
                    App Update
                </h3>
            </div>

            <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-700 dark:text-zinc-100">
                            One Punch DevKit v{state.currentVersion}
                        </span>
                        <span className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                            state.status === "error"
                                ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300"
                                : state.status === "downloaded"
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                                    : "bg-[#7d6df7]/10 text-[#6654e8] dark:text-[#c4baff]"
                        }`}>
                            {statusLabel}
                        </span>
                    </div>

                    {(state.message || actionError || progressDetail) && (
                        <p className={`text-xs ${state.status === "error" || actionError ? "text-red-500 dark:text-red-300" : "text-slate-500 dark:text-zinc-400"}`}>
                            {actionError || state.message || progressDetail}
                        </p>
                    )}

                    {state.status === "downloading" && (
                        <div className="h-1.5 w-full max-w-md overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800">
                            <div
                                className="h-full rounded-full bg-[#7d6df7] transition-[width] duration-300"
                                style={{ width: `${Math.max(0, Math.min(100, state.percent ?? 0))}%` }}
                            />
                        </div>
                    )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void handleCheck()}
                        disabled={isBusy || state.status === "disabled"}
                        className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-200 dark:hover:bg-[#232938]">
                        <svg className={`h-4 w-4 ${isBusy ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20 11a8 8 0 10-2.34 5.66M20 11V5m0 6h-6" />
                        </svg>
                        Check Now
                    </button>

                    {state.status === "downloaded" && (
                        <button
                            type="button"
                            onClick={() => void handleInstall()}
                            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#7d6df7] px-3 text-xs font-bold text-white shadow-md shadow-[#7d6df7]/20 transition-all hover:bg-[#9387ff]">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6M5.5 16.5A8 8 0 0018 17M18.5 7.5A8 8 0 006 7" />
                            </svg>
                            Restart &amp; Install
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
