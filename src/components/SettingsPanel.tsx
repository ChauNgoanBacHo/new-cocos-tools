import { useMemo, useState } from "react";
import { useStoredState } from "../hooks/useStoredState";
import {
    DEFAULT_ANIM_EXCLUDE_LIST,
    DEFAULT_SOUND_EXCLUDE_LIST,
    normalizeExcludeList,
} from "../constants/generatorExcludes";

type MenuItem = {
    id: string;
    label: string;
};

type MenuGroup = {
    id: string;
    label: string;
    items: MenuItem[];
};

type SettingsPanelProps = {
    isDark: boolean;
    menuGroups: MenuGroup[];
    hiddenMenuGroupIds: string[];
    onToggleMenuGroupVisibility: (groupId: string) => void;
    onMoveMenuGroup: (draggedId: string, targetId: string) => void;
    onResetMenuOrder: () => void;
};

export function SettingsPanel({
    isDark,
    menuGroups,
    hiddenMenuGroupIds,
    onToggleMenuGroupVisibility,
    onMoveMenuGroup,
    onResetMenuOrder,
}: SettingsPanelProps) {
    const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string>("");
    const [soundExcludeList, setSoundExcludeList] = useStoredState<string[]>(
        "sound-generator-exclude-list",
        DEFAULT_SOUND_EXCLUDE_LIST,
    );
    const [animExcludeList, setAnimExcludeList] = useStoredState<string[]>(
        "anim-generator-exclude-list",
        DEFAULT_ANIM_EXCLUDE_LIST,
    );

    const hiddenGroupSet = useMemo(() => new Set(hiddenMenuGroupIds), [hiddenMenuGroupIds]);

    const handleDownloadExtension = async () => {
        setIsExporting(true);
        setStatusMessage("");

        try {
            const result = await window.electronAPI.cheatExtension.exportZip();
            if (!result.ok) {
                setStatusMessage("Export extension was cancelled.");
                return;
            }

            setStatusMessage(`Extension ZIP exported: ${result.filePath}`);
        } catch (error) {
            setStatusMessage(
                error instanceof Error
                    ? `Export failed: ${error.message}`
                    : "Export failed.",
            );
        } finally {
            setIsExporting(false);
        }
    };

    const renderExcludeListEditor = (
        title: string,
        description: string,
        values: string[],
        onChange: (nextValues: string[]) => void,
        defaultValues: string[],
    ) => {
        const normalizedValues = normalizeExcludeList(values);

        return (
            <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 space-y-3">
                <div>
                    <div className="text-sm font-semibold text-slate-700 dark:text-zinc-200">{title}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-zinc-400">{description}</div>
                </div>

                <div className="flex flex-wrap gap-2">
                    {normalizedValues.map((item) => (
                        <span
                            key={item}
                            className="inline-flex items-center gap-2 rounded-full border border-amber-300/70 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
                            <span>{item}</span>
                            <button
                                type="button"
                                onClick={() => onChange(normalizedValues.filter((value) => value !== item))}
                                className="text-[10px] text-amber-700/80 opacity-70 hover:opacity-100 cursor-pointer dark:text-amber-200/85">
                                ×
                            </button>
                        </span>
                    ))}
                </div>

                <div className="flex flex-wrap gap-2">
                    <input
                        type="text"
                        placeholder="Add exclude key and press Enter"
                        className="min-w-[240px] flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25 dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-100 dark:placeholder-zinc-500"
                        onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            const input = event.currentTarget;
                            const nextValue = input.value.trim().toUpperCase();
                            if (!nextValue) return;
                            onChange(normalizeExcludeList([...normalizedValues, nextValue]));
                            input.value = "";
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => onChange(defaultValues)}
                        className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-100 cursor-pointer dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-200 dark:hover:bg-[#232938]">
                        Reset Default
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div>
            <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 dark:border-zinc-700 pb-4">
                <div className="flex items-center gap-3">
                    <div className="text-left">
                        <h2 className="text-2xl font-bold text-[#9b8cff] mb-1">
                            Settings
                        </h2>
                        <p className="text-slate-500 dark:text-zinc-400 text-xs">
                            Manage sidebar visibility, menu order, and extension download.
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-white border border-slate-200 dark:bg-[#2b3140] dark:border-white/5 rounded-2xl shadow-[0_18px_36px_rgba(148,163,184,0.16)] dark:shadow-[0_18px_36px_rgba(10,12,18,0.28)] overflow-hidden space-y-6">
                <div className="p-6 space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-200 dark:border-zinc-600 pb-2.5 mb-2">
                        <span className="text-sm">🧭</span>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 font-mono">
                            Sidebar Menu
                        </h3>
                    </div>

                    <p className="text-xs text-slate-500 dark:text-zinc-400">
                        Drag and drop to reorder menu groups. Toggle any group off if you want to hide that whole section from the main sidebar.
                    </p>

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={onResetMenuOrder}
                            className="px-3 py-2 rounded-lg border border-[#7d6df7]/25 bg-[#f3efff] hover:bg-[#ebe4ff] text-xs font-semibold text-[#6d57f3] transition-all cursor-pointer dark:bg-[#7d6df7]/10 dark:hover:bg-[#7d6df7]/18 dark:text-[#c2b7ff]">
                            Reset Menu Order
                        </button>
                    </div>

                    <div className="space-y-2">
                        {menuGroups.map((group) => {
                            const isHidden = hiddenGroupSet.has(group.id);
                            return (
                                <div
                                    key={group.id}
                                    draggable
                                    onDragStart={() => setDraggedGroupId(group.id)}
                                    onDragOver={(event) => {
                                        event.preventDefault();
                                    }}
                                    onDrop={() => {
                                        if (draggedGroupId && draggedGroupId !== group.id) {
                                            onMoveMenuGroup(draggedGroupId, group.id);
                                        }
                                        setDraggedGroupId(null);
                                    }}
                                    onDragEnd={() => setDraggedGroupId(null)}
                                    className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-all ${
                                        draggedGroupId === group.id
                                            ? "border-[#7d6df7]/40 bg-[#7d6df7]/10"
                                            : "border-slate-200 bg-white dark:bg-zinc-900 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600"
                                    }`}>
                                    <div className="flex items-start gap-3">
                                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-500 cursor-grab text-sm font-bold">
                                            ⋮⋮
                                        </span>
                                        <div className="space-y-1">
                                            <div className="text-sm font-semibold text-slate-700 dark:text-zinc-200">
                                                {group.label}
                                            </div>
                                            <div className="text-xs text-slate-500 dark:text-zinc-400">
                                                {group.items.map((item) => item.label).join(" • ")}
                                            </div>
                                        </div>
                                    </div>

                                    <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={!isHidden}
                                            onChange={() => onToggleMenuGroupVisibility(group.id)}
                                            className="rounded border-slate-300 dark:border-zinc-600 text-[#7d6df7] focus:ring-[#7d6df7] cursor-pointer"
                                        />
                                        Visible
                                    </label>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="p-6 space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-200 dark:border-zinc-600 pb-2.5 mb-2">
                        <span className="text-sm">🧪</span>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 font-mono">
                            Generator Exclude List
                        </h3>
                    </div>

                    <div className="space-y-4">
                        {renderExcludeListEditor(
                            "Anim Generator",
                            "Những key/object trong danh sách này sẽ bị bỏ qua khi quét animation.",
                            animExcludeList,
                            (nextValues) => setAnimExcludeList(normalizeExcludeList(nextValues)),
                            DEFAULT_ANIM_EXCLUDE_LIST,
                        )}
                        {renderExcludeListEditor(
                            "Sound Generator",
                            "Những key trong danh sách này sẽ bị bỏ qua khi quét sound.",
                            soundExcludeList,
                            (nextValues) => setSoundExcludeList(normalizeExcludeList(nextValues)),
                            DEFAULT_SOUND_EXCLUDE_LIST,
                        )}
                    </div>
                </div>

                <div className="p-6 space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-200 dark:border-zinc-600 pb-2.5 mb-2">
                        <span className="text-sm">🧩</span>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 font-mono">
                            Extension Download
                        </h3>
                    </div>

                    <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 space-y-3">
                        <p className="text-sm text-slate-600 dark:text-zinc-300 leading-6">
                            Download the latest browser extension ZIP here, then load it from <span className="font-mono">chrome://extensions</span> using developer mode.
                        </p>
                        <div className="text-xs text-slate-500 dark:text-zinc-400 leading-6">
                            1. Download the ZIP file.
                            <br />
                            2. Extract it to a folder.
                            <br />
                            3. Open Chrome Extensions.
                            <br />
                            4. Turn on Developer Mode.
                            <br />
                            5. Choose Load unpacked and select the extracted folder.
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    void handleDownloadExtension();
                                }}
                                disabled={isExporting}
                                className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                                    isExporting
                                        ? "bg-slate-300 text-slate-500 dark:bg-zinc-700 dark:text-zinc-500 cursor-not-allowed"
                                        : "bg-[#7d6df7] hover:bg-[#9387ff] text-white cursor-pointer shadow-md shadow-[#7d6df7]/25"
                                }`}>
                                {isExporting ? "Exporting..." : "Download Extension ZIP"}
                            </button>
                            {statusMessage && (
                                <span className={`text-xs ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                                    {statusMessage}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
