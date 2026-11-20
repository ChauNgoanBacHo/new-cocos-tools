import { useMemo, useState } from "react";
import { useStoredState } from "../hooks/useStoredState";
import {
    DEFAULT_ANIM_EXCLUDE_LIST,
    DEFAULT_SOUND_EXCLUDE_LIST,
    normalizeExcludeList,
} from "../constants/generatorExcludes";
import {
    SPINE_ALIASES_STORAGE_KEY,
    type PathAlias,
} from "../constants/spineAliases";
import { AppUpdateSettings } from "./AppUpdateSettings";

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
    menuGroups: MenuGroup[];
    hiddenMenuGroupIds: string[];
    onToggleMenuGroupVisibility: (groupId: string) => void;
    onMoveMenuGroup: (draggedId: string, targetId: string) => void;
    onResetMenuOrder: () => void;
};

export function SettingsPanel({
    menuGroups,
    hiddenMenuGroupIds,
    onToggleMenuGroupVisibility,
    onMoveMenuGroup,
    onResetMenuOrder,
}: SettingsPanelProps) {
    const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string>("");
    const [soundExcludeList, setSoundExcludeList] = useStoredState<string[]>(
        "sound-generator-exclude-list",
        DEFAULT_SOUND_EXCLUDE_LIST,
    );
    const [animExcludeList, setAnimExcludeList] = useStoredState<string[]>(
        "anim-generator-exclude-list",
        DEFAULT_ANIM_EXCLUDE_LIST,
    );
    const [spineAliases, setSpineAliases] = useStoredState<PathAlias[]>(
        SPINE_ALIASES_STORAGE_KEY,
        [],
    );
    const [aliasName, setAliasName] = useState("");
    const [aliasPath, setAliasPath] = useState("");
    const [editingAliasId, setEditingAliasId] = useState<string | null>(null);

    const hiddenGroupSet = useMemo(() => new Set(hiddenMenuGroupIds), [hiddenMenuGroupIds]);
    const sortAliases = (aliases: PathAlias[]) => [...aliases].sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" })
    );
    const sortedSpineAliases = useMemo(() => sortAliases(spineAliases), [spineAliases]);

    const resetAliasForm = () => {
        setAliasName("");
        setAliasPath("");
        setEditingAliasId(null);
    };

    const handleEditAlias = (alias: PathAlias) => {
        setEditingAliasId(alias.id);
        setAliasName(alias.name);
        setAliasPath(alias.path);
    };

    const handleSaveAlias = () => {
        const trimmedName = aliasName.trim();
        const trimmedPath = aliasPath.trim();

        if (!trimmedName || !trimmedPath) {
            setStatusMessage("Alias name and path are required.");
            return;
        }

        const duplicateAlias = spineAliases.find((alias) =>
            alias.name.trim().toLowerCase() === trimmedName.toLowerCase() &&
            alias.id !== editingAliasId
        );
        if (duplicateAlias) {
            setStatusMessage(`Alias already exists: ${trimmedName}`);
            return;
        }

        if (editingAliasId) {
            setSpineAliases((prev) =>
                prev.map((alias) =>
                    alias.id === editingAliasId
                        ? { ...alias, name: trimmedName, path: trimmedPath }
                        : alias
                )
            );
            setStatusMessage(`Alias updated: ${trimmedName}`);
        } else {
            setSpineAliases((prev) => [
                ...prev,
                {
                    id: `spine-alias-${Date.now()}`,
                    name: trimmedName,
                    path: trimmedPath,
                },
            ]);
            setStatusMessage(`Alias added: ${trimmedName}`);
        }

        resetAliasForm();
    };

    const handleDeleteAlias = (aliasId: string) => {
        const targetAlias = spineAliases.find((alias) => alias.id === aliasId);
        setSpineAliases((prev) => prev.filter((alias) => alias.id !== aliasId));

        if (editingAliasId === aliasId) {
            resetAliasForm();
        }

        setStatusMessage(targetAlias ? `Alias deleted: ${targetAlias.name}` : "Alias deleted.");
    };

    const handleSelectAliasPath = async () => {
        const folder = await window.electronAPI.selectFolder();
        if (!folder) return;
        setAliasPath(folder);
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
                            Manage sidebar visibility, menu order, shared aliases, and generator defaults.
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-white border border-slate-200 dark:bg-[#2b3140] dark:border-white/5 rounded-2xl shadow-[0_18px_36px_rgba(148,163,184,0.16)] dark:shadow-[0_18px_36px_rgba(10,12,18,0.28)] overflow-hidden space-y-6">
                <AppUpdateSettings />

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
                        <span className="text-sm">🔖</span>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 font-mono">
                            Path Aliases
                        </h3>
                    </div>

                    <div className="space-y-4">
                        <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 space-y-4">
                            <div>
                                <div className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Shared Path Aliases</div>
                                <div className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                                    Alias dùng chung cho cac page can nap nhanh folder hoac source path.
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[140px_minmax(0,1fr)_auto]">
                                <input
                                    type="text"
                                    value={aliasName}
                                    onChange={(event) => setAliasName(event.target.value)}
                                    placeholder="Alias Name"
                                    className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25 dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-100 dark:placeholder-zinc-500"
                                />
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={aliasPath}
                                        onChange={(event) => setAliasPath(event.target.value)}
                                        placeholder="Folder path"
                                        className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25 dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-100 dark:placeholder-zinc-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            void handleSelectAliasPath();
                                        }}
                                        title="Browse alias path"
                                        aria-label="Browse alias path"
                                        className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-700 hover:border-[#7d6df7]/20 cursor-pointer dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-400 dark:hover:bg-[#232938] dark:hover:text-zinc-200">
                                        <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5A1.75 1.75 0 015.5 5.75h4l1.5 1.75h7a1.75 1.75 0 011.75 1.75v7A1.75 1.75 0 0118 18H5.5a1.75 1.75 0 01-1.75-1.75v-8.75z" />
                                        </svg>
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleSaveAlias}
                                    className="px-3 py-2 rounded-xl bg-[#7d6df7] text-xs font-bold text-white transition-all hover:bg-[#9387ff] cursor-pointer shadow-md shadow-[#7d6df7]/20">
                                    {editingAliasId ? "Update Alias" : "Add Alias"}
                                </button>
                            </div>

                            {statusMessage && (
                                <div className="text-xs text-slate-500 dark:text-zinc-400">
                                    {statusMessage}
                                </div>
                            )}

                            {sortedSpineAliases.length > 0 ? (
                                <div className="space-y-2">
                                    {sortedSpineAliases.map((alias) => (
                                        <div
                                            key={alias.id}
                                            className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-white/5 dark:bg-[#1b2029] lg:flex-row lg:items-center lg:justify-between">
                                            <div className="flex min-w-0 flex-1 items-center gap-3">
                                                <span className="inline-flex min-w-[84px] items-center justify-center rounded-lg bg-[#7d6df7]/12 px-2.5 py-1 text-[11px] font-bold text-[#5c46ff] dark:text-[#c9bfff]">
                                                    {alias.name}
                                                </span>
                                                <span className="truncate text-xs text-slate-600 dark:text-zinc-300">
                                                    {alias.path}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleEditAlias(alias)}
                                                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-800 cursor-pointer dark:border-white/5 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10">
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteAlias(alias.id)}
                                                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-600 transition-all hover:bg-red-100 cursor-pointer dark:border-red-400/25 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/15">
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-white/5 dark:text-zinc-500">
                                    No aliases yet. Add a few common paths here for faster access.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
