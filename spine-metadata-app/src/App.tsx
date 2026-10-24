import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getInitialApiUrl, rememberApiUrl, SpineSheetApi, validateApiUrl } from "./api";
import { renderSpinePose } from "./spineRenderer";
import { scanSpineFiles } from "./spineScanner";
import type { AnimationMetadata, LocalSpineAsset, NativeSpineFolderResult, SaveState } from "./types";

const RECENT_GAMES_KEY = "spine-metadata-recent-games";
const SPINE_FOLDER_PATHS_KEY = "spine-metadata-folder-paths";

function rowId(gameId: string, spineName: string, animationName: string): string {
    return [gameId, spineName, animationName].map(encodeURIComponent).join("::");
}

function emptyRow(gameId: string, spineName: string, animationName: string): AnimationMetadata {
    return {
        id: rowId(gameId, spineName, animationName),
        gameId,
        spineName,
        animationName,
        previewTimeSec: 0,
        placement: "",
        playCondition: "",
        needsDevInput: false,
        updatedAt: "",
    };
}

function readRecentGames(): string[] {
    try {
        const value = JSON.parse(localStorage.getItem(RECENT_GAMES_KEY) || "[]") as unknown;
        return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    } catch {
        return [];
    }
}

function rememberGame(gameId: string): void {
    const recent = [gameId, ...readRecentGames().filter((item) => item !== gameId)].slice(0, 8);
    localStorage.setItem(RECENT_GAMES_KEY, JSON.stringify(recent));
}

function readSpineFolderPaths(): Record<string, string> {
    try {
        const value = JSON.parse(localStorage.getItem(SPINE_FOLDER_PATHS_KEY) || "{}") as unknown;
        if (!value || typeof value !== "object" || Array.isArray(value)) return {};
        return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    } catch {
        return {};
    }
}

function nativeFilesToFiles(result: NativeSpineFolderResult): File[] {
    return result.files.map((entry) => {
        const bytes = Uint8Array.from(entry.data);
        const file = new File([bytes], entry.name);
        Object.defineProperty(file, "webkitRelativePath", { value: entry.relativePath });
        return file;
    });
}

function formatTime(value: number): string {
    return `${value.toFixed(2)}s`;
}

function MetadataInput({
    value,
    placeholder,
    onSave,
}: {
    value: string;
    placeholder: string;
    onSave: (value: string) => Promise<void>;
}) {
    const [draft, setDraft] = useState(value);
    const [saveState, setSaveState] = useState<SaveState>("idle");

    useEffect(() => setDraft(value), [value]);

    const save = async () => {
        const next = draft.trim();
        if (next === value) return;
        setSaveState("saving");
        try {
            await onSave(next);
            setSaveState("saved");
            window.setTimeout(() => setSaveState("idle"), 1200);
        } catch {
            setSaveState("error");
        }
    };

    return (
        <label className={`note-field note-field--${saveState}`}>
            <textarea
                value={draft}
                placeholder={placeholder}
                rows={2}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => void save()}
            />
            <span className="save-state" aria-live="polite">
                {saveState === "saving" && "Saving..."}
                {saveState === "saved" && "Saved"}
                {saveState === "error" && "Save failed"}
            </span>
        </label>
    );
}

function SpinePose({
    asset,
    animationName,
    timeSec,
}: {
    asset: LocalSpineAsset;
    animationName: string;
    timeSec: number;
}) {
    const [image, setImage] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        setError("");
        void renderSpinePose(asset, animationName, timeSec)
            .then((nextImage) => {
                if (!cancelled) setImage(nextImage);
            })
            .catch((renderError: unknown) => {
                if (!cancelled) {
                    setError(renderError instanceof Error ? renderError.message : "Cannot render this Spine.");
                }
            });
        return () => {
            cancelled = true;
        };
    }, [asset, animationName, timeSec]);

    return (
        <div className="spine-pose">
            {image && !error ? <img src={image} alt={`${asset.spineName} ${animationName}`} /> : null}
            {!image && !error ? <span>Rendering pose...</span> : null}
            {error ? <span className="pose-error">{error}</span> : null}
        </div>
    );
}

interface SpineGroup {
    name: string;
    asset?: LocalSpineAsset;
    rows: AnimationMetadata[];
}

function App() {
    const initialApiUrl = useMemo(getInitialApiUrl, []);
    const initialApiError = validateApiUrl(initialApiUrl);
    const [apiUrl, setApiUrl] = useState(initialApiError ? "" : initialApiUrl);
    const [apiDraft, setApiDraft] = useState(initialApiUrl);
    const [apiSettingsError, setApiSettingsError] = useState(initialApiUrl ? initialApiError : null);
    const [showApiSettings, setShowApiSettings] = useState(!initialApiUrl || Boolean(initialApiError));
    const [games, setGames] = useState<string[]>([]);
    const [recentGames, setRecentGames] = useState(readRecentGames);
    const [spineFolderPaths, setSpineFolderPaths] = useState(readSpineFolderPaths);
    const [selectedGameId, setSelectedGameId] = useState("");
    const [sheetFound, setSheetFound] = useState(false);
    const [rows, setRows] = useState<AnimationMetadata[]>([]);
    const [assets, setAssets] = useState<LocalSpineAsset[]>([]);
    const [selectedAnimations, setSelectedAnimations] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [message, setMessage] = useState<{ type: "info" | "error" | "success"; text: string } | null>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);

    const api = useMemo(() => apiUrl ? new SpineSheetApi(apiUrl) : null, [apiUrl]);

    useEffect(() => {
        folderInputRef.current?.setAttribute("webkitdirectory", "");
        folderInputRef.current?.setAttribute("directory", "");
    }, []);

    const loadGames = useCallback(async () => {
        if (!api) return;
        try {
            setGames(await api.listGames());
        } catch (error) {
            setMessage({
                type: "error",
                text: error instanceof Error ? error.message : "Cannot load game list.",
            });
        }
    }, [api]);

    useEffect(() => {
        void loadGames();
    }, [loadGames]);

    const openGame = async (rawGameId: string) => {
        const gameId = rawGameId.trim();
        if (!api || !gameId) return;

        setSelectedGameId(gameId);
        setSheetFound(false);
        setRows([]);
        setAssets([]);
        setLoading(true);
        setMessage(null);
        try {
            const game = await api.getGame(gameId);
            setRows(game.rows);
            setSheetFound(true);
            rememberGame(gameId);
            setRecentGames(readRecentGames());
            setMessage({
                type: "info",
                text: spineFolderPaths[gameId]
                    ? "Saved Spine folder is ready. Rescan it or choose another folder."
                    : "Choose a Spine folder to scan local assets.",
            });
        } catch (error) {
            if (error instanceof Error && error.name === "TAB_NOT_FOUND") {
                setMessage({
                    type: "error",
                    text: `Cannot find Sheet tab "${gameId}". Please open Google Sheets and create this tab first.`,
                });
            } else {
                setMessage({
                    type: "error",
                    text: error instanceof Error ? error.message : "Cannot open this game.",
                });
            }
        } finally {
            setLoading(false);
        }
    };

    const handleFolder = async (files: FileList | File[] | null, folderPath?: string) => {
        if (!files?.length) return;
        if (!api || !selectedGameId || !sheetFound) {
            setMessage({ type: "error", text: "Select a game ID before scanning a Spine folder." });
            return;
        }
        setScanning(true);
        setMessage(null);
        try {
            const scanned = await scanSpineFiles(files);
            if (!scanned.length) {
                throw new Error("No valid Spine JSON or SKEL/atlas pairs were found in this folder.");
            }
            const existingById = new Map(rows.map((row) => [row.id, row]));
            const scannedRows = scanned.flatMap((asset) => asset.animations.map((animation) => {
                const id = rowId(selectedGameId, asset.spineName, animation.name);
                return existingById.get(id) || emptyRow(selectedGameId, asset.spineName, animation.name);
            }));
            const scannedIds = new Set(scannedRows.map((row) => row.id));
            const removedCount = rows.filter((row) => !scannedIds.has(row.id)).length;
            const synced = await api.upsertMany(selectedGameId, scannedRows);
            if (folderPath) {
                const nextPaths = { ...spineFolderPaths, [selectedGameId]: folderPath };
                localStorage.setItem(SPINE_FOLDER_PATHS_KEY, JSON.stringify(nextPaths));
                setSpineFolderPaths(nextPaths);
            }
            setAssets(scanned);
            setRows(synced.rows);
            setSelectedAnimations(Object.fromEntries(scanned.map((asset) => [asset.spineName, asset.animations[0]?.name || ""])));
            setMessage({
                type: "success",
                text: `Synced ${scanned.length} Spine file(s) and ${scannedRows.length} animation(s)${removedCount ? `; removed ${removedCount} stale row(s)` : ""}.`,
            });
        } catch (error) {
            setMessage({
                type: "error",
                text: error instanceof Error ? error.message : "Spine scan failed.",
            });
        } finally {
            setScanning(false);
            if (folderInputRef.current) folderInputRef.current.value = "";
        }
    };

    const chooseSpineFolder = async () => {
        if (!window.spineNotes) {
            folderInputRef.current?.click();
            return;
        }

        try {
            const result = await window.spineNotes.selectFolder();
            if (result.canceled) return;
            await handleFolder(nativeFilesToFiles(result), result.folderPath);
        } catch (error) {
            setMessage({
                type: "error",
                text: error instanceof Error ? error.message : "Cannot read the selected Spine folder.",
            });
        }
    };

    const rescanSavedFolder = async () => {
        const folderPath = spineFolderPaths[selectedGameId];
        if (!folderPath || !window.spineNotes) return;
        try {
            const result = await window.spineNotes.scanFolder(folderPath);
            await handleFolder(nativeFilesToFiles(result), folderPath);
        } catch (error) {
            setMessage({
                type: "error",
                text: error instanceof Error
                    ? `${error.message} Choose the Spine folder again to update the saved path.`
                    : "Cannot read the saved Spine folder.",
            });
        }
    };

    const updateRow = async (row: AnimationMetadata, patch: Partial<AnimationMetadata>) => {
        if (!api) return;
        const next = { ...row, ...patch };
        setRows((current) => current.map((item) => item.id === row.id ? next : item));
        try {
            const saved = await api.upsertAnimation(next);
            setRows((current) => current.map((item) => item.id === saved.id ? saved : item));
        } catch (error) {
            setRows((current) => current.map((item) => item.id === row.id ? row : item));
            throw error;
        }
    };

    const setSpineNeedsDevInput = async (group: SpineGroup, needsDevInput: boolean) => {
        if (!api || !selectedGameId || !group.rows.length) return;
        const previousRows = rows;
        const nextRows = group.rows.map((row) => ({ ...row, needsDevInput }));
        setRows((current) => current.map((row) => row.spineName === group.name ? { ...row, needsDevInput } : row));
        try {
            await Promise.all(nextRows.map((row) => api.upsertAnimation(row)));
            setMessage({
                type: "success",
                text: needsDevInput
                    ? `Highlighted ${group.name}.`
                    : `Removed highlight from ${group.name}.`,
            });
        } catch (error) {
            setRows(previousRows);
            setMessage({
                type: "error",
                text: error instanceof Error ? error.message : "Cannot update this Spine flag.",
            });
        }
    };

    const groups = useMemo<SpineGroup[]>(() => {
        const byName = new Map<string, SpineGroup>();
        for (const row of rows) {
            const group = byName.get(row.spineName) || { name: row.spineName, rows: [] };
            group.rows.push(row);
            byName.set(row.spineName, group);
        }
        for (const asset of assets) {
            const group = byName.get(asset.spineName) || { name: asset.spineName, rows: [] };
            group.asset = asset;
            byName.set(asset.spineName, group);
        }
        return Array.from(byName.values())
            .map((group) => ({ ...group, rows: [...group.rows].sort((a, b) => a.animationName.localeCompare(b.animationName)) }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [assets, rows]);

    const visibleGameIds = useMemo(
        () => Array.from(new Set([...games, ...recentGames])).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
        [games, recentGames],
    );

    const applyApiUrl = async () => {
        const next = apiDraft.trim();
        const validationError = validateApiUrl(next);
        if (validationError) {
            setApiSettingsError(validationError);
            return;
        }
        setConnecting(true);
        setApiSettingsError(null);
        try {
            const nextGames = await new SpineSheetApi(next).listGames();
            rememberApiUrl(next);
            setApiUrl(next);
            setGames(nextGames);
            setShowApiSettings(false);
            setSelectedGameId("");
            setSheetFound(false);
            setRows([]);
            setAssets([]);
            setMessage(nextGames.length
                ? { type: "success", text: `Loaded ${nextGames.length} game tab(s) from Google Sheets.` }
                : { type: "info", text: "Connected. No game tabs were found in Google Sheets." });
        } catch (error) {
            setApiSettingsError(error instanceof Error ? error.message : "Cannot connect to Google Sheets.");
        } finally {
            setConnecting(false);
        }
    };

    return (
        <div className="app-shell">
            <header className="topbar">
                <div>
                    <p className="eyebrow">Animation handoff</p>
                    <h1>Spine Notes</h1>
                </div>
                <div className="topbar-actions">
                    {selectedGameId ? <span className="active-game">Game {selectedGameId}</span> : null}
                    <button className="icon-button" type="button" title="Sheet API settings" onClick={() => setShowApiSettings(true)}>
                        API
                    </button>
                </div>
            </header>

            <main className="workspace">
                <aside className="game-sidebar">
                    <div className="sidebar-heading">
                        <span>Games</span>
                        <span>{visibleGameIds.length}</span>
                    </div>
                    <div className="game-list">
                        {visibleGameIds.map((gameId) => (
                            <button
                                key={gameId}
                                type="button"
                                className={selectedGameId === gameId ? "game-button game-button--active" : "game-button"}
                                onClick={() => void openGame(gameId)}
                            >
                                {gameId}
                            </button>
                        ))}
                        {visibleGameIds.length === 0 ? <p className="muted-copy">No game tabs found.</p> : null}
                    </div>
                </aside>

                <section className="content-area">
                    {!selectedGameId ? (
                        <div className="empty-state">
                            <span className="empty-index">01</span>
                            <h2>Select a game ID</h2>
                            <p>Metadata is read from the Sheet tab with the same game ID.</p>
                        </div>
                    ) : null}

                    {message ? <div className={`message message--${message.type}`}>{message.text}</div> : null}

                    {selectedGameId && sheetFound ? (
                        <div className="content-toolbar">
                            <div>
                                <strong>{groups.length} Spine groups</strong>
                                <span>{rows.length} animations</span>
                                {spineFolderPaths[selectedGameId] ? (
                                    <span className="saved-folder-path" title={spineFolderPaths[selectedGameId]}>
                                        {spineFolderPaths[selectedGameId]}
                                    </span>
                                ) : null}
                            </div>
                            <input ref={folderInputRef} className="hidden-input" type="file" multiple onChange={(event) => void handleFolder(event.target.files)} />
                            <div className="toolbar-actions">
                                {spineFolderPaths[selectedGameId] && window.spineNotes ? (
                                    <button type="button" className="primary-button" disabled={scanning} onClick={() => void rescanSavedFolder()}>
                                        {scanning ? "Scanning..." : "Rescan saved folder"}
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    className={spineFolderPaths[selectedGameId] ? "secondary-button" : "primary-button"}
                                    disabled={scanning}
                                    onClick={() => void chooseSpineFolder()}
                                >
                                    {spineFolderPaths[selectedGameId] ? "Choose another folder" : scanning ? "Scanning..." : "Choose Spine folder"}
                                </button>
                            </div>
                        </div>
                    ) : null}

                    {selectedGameId && sheetFound && groups.length === 0 && !scanning ? (
                        <div className="empty-state empty-state--small">
                            <span className="empty-index">02</span>
                            <h2>No Spine data yet</h2>
                            <p>Choose the game Spine folder. New animation rows will be added without overwriting existing notes.</p>
                        </div>
                    ) : null}

                    <div className="spine-groups">
                        {groups.map((group, groupIndex) => {
                            const needsDevInput = group.rows.some((row) => Boolean(row.needsDevInput));
                            const selectedName = selectedAnimations[group.name] || group.rows[0]?.animationName || "";
                            const selectedRow = group.rows.find((row) => row.animationName === selectedName) || group.rows[0];
                            const localAnimation = group.asset?.animations.find((item) => item.name === selectedRow?.animationName);
                            const duration = localAnimation?.duration || Math.max(selectedRow?.previewTimeSec || 0, 1);
                            const previewTime = Math.min(selectedRow?.previewTimeSec || 0, duration);

                            return (
                                <article className={needsDevInput ? "spine-group spine-group--needs-dev" : "spine-group"} key={group.name}>
                                    <div className="spine-summary">
                                        <div className="spine-index">{String(groupIndex + 1).padStart(2, "0")}</div>
                                        <div className="spine-title">
                                            <h2>{group.name}</h2>
                                            <span>{group.asset?.relativeJsonPath || "Local Spine file not loaded"}</span>
                                        </div>
                                        <label className="dev-question-toggle">
                                            <input
                                                type="checkbox"
                                                checked={needsDevInput}
                                                onChange={(event) => void setSpineNeedsDevInput(group, event.target.checked)}
                                            />
                                            <span>Highlight</span>
                                        </label>
                                        <span className="animation-count">{group.rows.length} animations</span>
                                    </div>

                                    <div className="spine-body">
                                        <div className="preview-column">
                                            {group.asset && selectedRow ? (
                                                <SpinePose asset={group.asset} animationName={selectedRow.animationName} timeSec={previewTime} />
                                            ) : (
                                                <div className="spine-pose"><span>Scan the local folder to render this pose.</span></div>
                                            )}
                                            {selectedRow ? (
                                                <div className="timeline-control">
                                                    <div><span>Pose time</span><strong>{formatTime(previewTime)} / {formatTime(duration)}</strong></div>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max={duration}
                                                        step="0.0167"
                                                        value={previewTime}
                                                        disabled={!group.asset}
                                                        onChange={(event) => {
                                                            const nextTime = Number(event.target.value);
                                                            setRows((current) => current.map((item) => item.id === selectedRow.id
                                                                ? { ...item, previewTimeSec: nextTime }
                                                                : item));
                                                        }}
                                                        onPointerUp={() => void updateRow(selectedRow, { previewTimeSec: previewTime })}
                                                        onKeyUp={() => void updateRow(selectedRow, { previewTimeSec: previewTime })}
                                                    />
                                                </div>
                                            ) : null}
                                        </div>

                                        <div className="animation-table">
                                            <div className="animation-table-head">
                                                <span>Animation</span>
                                                <span>Nơi xuất hiện</span>
                                                <span>Khi nào diễn</span>
                                            </div>
                                            {group.rows.map((row) => (
                                                <div
                                                    className={row.id === selectedRow?.id ? "animation-row animation-row--selected" : "animation-row"}
                                                    key={row.id}
                                                    onClick={() => setSelectedAnimations((current) => ({ ...current, [group.name]: row.animationName }))}
                                                >
                                                    <button type="button" className="animation-name" title="Show this animation pose">
                                                        {row.animationName}
                                                    </button>
                                                    <MetadataInput
                                                        value={row.placement}
                                                        placeholder=""
                                                        onSave={(placement) => updateRow(row, { placement })}
                                                    />
                                                    <MetadataInput
                                                        value={row.playCondition}
                                                        placeholder=""
                                                        onSave={(playCondition) => updateRow(row, { playCondition })}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </section>
            </main>

            {showApiSettings ? (
                <div className="modal-backdrop" role="presentation">
                    <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="api-settings-title">
                        <div>
                            <p className="eyebrow">Connection</p>
                            <h2 id="api-settings-title">Google Apps Script API</h2>
                        </div>
                        <label>
                            Web app URL
                            <input
                                autoFocus
                                value={apiDraft}
                                placeholder="https://script.google.com/macros/s/.../exec"
                                onChange={(event) => {
                                    setApiDraft(event.target.value);
                                    setApiSettingsError(null);
                                }}
                            />
                        </label>
                        {apiSettingsError ? <div className="settings-error">{apiSettingsError}</div> : null}
                        <div className="modal-actions">
                            {apiUrl ? <button type="button" className="secondary-button" onClick={() => setShowApiSettings(false)}>Cancel</button> : null}
                            <button
                                type="button"
                                className="primary-button"
                                disabled={!apiDraft.trim() || connecting}
                                onClick={() => void applyApiUrl()}
                            >
                                {connecting ? "Connecting..." : "Connect"}
                            </button>
                        </div>
                    </section>
                </div>
            ) : null}
        </div>
    );
}

export default App;
