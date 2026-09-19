import { useEffect, useState } from "react";
import { useStoredState } from "../hooks/useStoredState";

interface ReplaceSpriteResult {
    sceneFilePath: string;
    gameId: string;
    scannedAssets: number;
    mappingCount: number;
    replacedCount: number;
    unasyncPrefabCount: number;
    changed: boolean;
    details: Array<{
        mapping: string;
        nodePath?: string;
        nodeName?: string;
        assetName?: string;
        status: "replaced" | "missing-node" | "missing-asset" | "missing-component" | "error";
        message: string;
    }>;
}

interface MappingRow {
    id: string;
    path: string;
    value: string;
}

const DEFAULT_MAPPING_ROWS: MappingRow[] = [
    { id: "bg-main-g", path: "GameMode/BG_MainG", value: "BG_MainG" },
    { id: "board-g", path: "GameMode/BoardG", value: "BoardG" },
    { id: "text-spin", path: "UIManager/NormalSpinButton/Text_Spin", value: "Text_Spin" },
    { id: "icon-promotion", path: "UIManager/IconPromotion", value: "Icon_Promotion" },
    { id: "jackpot-frame", path: "UIManager/Jackpot/Frame_Jackpot", value: "Frame_Jackpot" },
    { id: "trial-jackpot-frame", path: "UIManager/TrialJackpot/Frame_Jackpot", value: "Frame_Jackpot" },
    { id: "back-to-lobby-button", path: "UIManager/BackToLobbyButton/Button", value: "Btn_Home_Normal, Btn_Home_Pressed, Btn_Home_Hover, Btn_Home_Disable" },
    { id: "setting-button", path: "UIManager/SettingButton", value: "Btn_Setting_Normal, Btn_Setting_Pressed, Btn_Setting_Hover, Btn_Setting_Disable" },
    { id: "turbo-button-off", path: "UIManager/TurboButton/Display/ButtonOff", value: "Btn_TurboOff_Normal, Btn_TurboOff_Pressed, Btn_TurboOff_Hover, Btn_TurboOff_Disable" },
    { id: "turbo-button-on", path: "UIManager/TurboButton/Display/ButtonOn", value: "Btn_TurboOn_Normal, Btn_TurboOn_Pressed, Btn_TurboOn_Hover, Btn_TurboOn_Disable" },
    { id: "frame-total-bet", path: "UIManager/Bet/Frame_TotalBet", value: "Frame_TotalBet" },
    { id: "frame-bet-size", path: "UIManager/Bet/Frame_BetSize", value: "Frame_BetSize" },
    { id: "bet-increase", path: "UIManager/Bet/BetIncrease", value: "Btn_Plus_Normal, Btn_Plus_Pressed, Btn_Plus_Hover, Btn_Plus_Disable" },
    { id: "bet-decrease", path: "UIManager/Bet/BetDecrease", value: "Btn_Minus_Normal, Btn_Minus_Pressed, Btn_Minus_Hover, Btn_Minus_Disable" },
    { id: "frame-wallet", path: "UIManager/Wallet/Frame_Wallet", value: "Frame_Balance" },
    { id: "trial-mode-tag", path: "UIManager/TrialModeTag", value: "Tag_DemoMode" },
    { id: "trial-mode-button-back", path: "UIManager/TrialModePrefab/ButtonBack", value: "Btn_RealPlay_Normal, Btn_RealPlay_Pressed, Btn_RealPlay_Hover, Btn_RealPlay_Disable" },
    { id: "info-panel-bg", path: "PopupControl/InfoPanel/BG", value: "Panel_L" },
    { id: "info-panel-trial-button", path: "PopupControl/InfoPanel/TrialButton", value: "Btn_RealPlay_Normal, Btn_RealPlay_Pressed, Btn_RealPlay_Hover, Btn_RealPlay_Disable" },
    { id: "info-panel-prev-button", path: "PopupControl/InfoPanel/preBtn", value: "Btn_Next_Normal, Btn_Next_Pressed, Btn_Next_Hover, Btn_Next_Disable" },
    { id: "info-panel-next-button", path: "PopupControl/InfoPanel/nextBtn", value: "Btn_Next_Normal, Btn_Next_Pressed, Btn_Next_Hover, Btn_Next_Disable" },
    { id: "info-panel-exit-button", path: "PopupControl/InfoPanel/exitBtn", value: "Btn_Close_Normal, Btn_Close_Pressed, Btn_Close_Hover, Btn_Close_Disable" },
    { id: "setting-panel-bg", path: "PopupControl/SettingPanel/PanelS_Half_L", value: "Panel_S" },
    { id: "setting-panel-title", path: "PopupControl/SettingPanel/Title_Setting", value: "Title_Setting" },
    { id: "setting-panel-back", path: "PopupControl/SettingPanel/Container/BtnBack", value: "Btn_Close_Normal, Btn_Close_Pressed, Btn_Close_Hover, Btn_Close_Disable" },
    { id: "setting-panel-music-line", path: "PopupControl/SettingPanel/Container/Buttons/Music", value: "Line_Music" },
    { id: "setting-panel-music-checkmark", path: "PopupControl/SettingPanel/Container/Buttons/Music/Checkmark", value: "Icon_Tick" },
    { id: "setting-panel-sfx-line", path: "PopupControl/SettingPanel/Container/Buttons/SFX", value: "Line_Sound" },
    { id: "setting-panel-sfx-checkmark", path: "PopupControl/SettingPanel/Container/Buttons/SFX/Checkmark", value: "Icon_Tick" },
    { id: "setting-panel-jp-history", path: "PopupControl/SettingPanel/Container/Buttons/JackpotHistoryBtn", value: "Btn_JPHistory_Normal, Btn_JPHistory_Pressed, Btn_JPHistory_Hover, Btn_JPHistory_Disable" },
    { id: "setting-panel-bet-history", path: "PopupControl/SettingPanel/Container/Buttons/BetHistoryBtn", value: "Btn_BetHistory_Normal, Btn_BetHistory_Pressed, Btn_BetHistory_Hover, Btn_BetHistory_Disable" },
    { id: "jackpot-history-popup-bg", path: "PopupControl/JackpotHistoryPopup", value: "Panel_L" },
    { id: "jackpot-history-table", path: "PopupControl/JackpotHistoryPopup/container/RecordView/BGTable", value: "Table_JPHistory" },
    { id: "jackpot-history-next", path: "PopupControl/JackpotHistoryPopup/container/Buttons/btnNext", value: "Btn_Next_Normal, Btn_Next_Pressed, Btn_Next_Hover, Btn_Next_Disable" },
    { id: "jackpot-history-back", path: "PopupControl/JackpotHistoryPopup/container/Buttons/btnBack", value: "Btn_Next_Normal, Btn_Next_Pressed, Btn_Next_Hover, Btn_Next_Disable" },
    { id: "jackpot-history-close", path: "PopupControl/JackpotHistoryPopup/container/Buttons/btnClose", value: "Btn_Close_Normal, Btn_Close_Pressed, Btn_Close_Hover, Btn_Close_Disable" },
    { id: "bet-history-bg", path: "PopupControl/BetHistory/Container/PanelS_Half", value: "Panel_L" },
    { id: "bet-history-table", path: "PopupControl/BetHistory/Container/RecordView/Table_BetHistory", value: "Table_BetHistory" },
    { id: "bet-history-title", path: "PopupControl/BetHistory/Container/RecordView/Title_BetHistory", value: "Title_BetHistory" },
    { id: "bet-history-next", path: "PopupControl/BetHistory/Container/RecordView/Buttons/btnNext", value: "Btn_Next_Normal, Btn_Next_Pressed, Btn_Next_Hover, Btn_Next_Disable" },
    { id: "bet-history-back", path: "PopupControl/BetHistory/Container/RecordView/Buttons/btnBack", value: "Btn_Next_Normal, Btn_Next_Pressed, Btn_Next_Hover, Btn_Next_Disable" },
    { id: "bet-history-close", path: "PopupControl/BetHistory/Container/RecordView/Buttons/btnClose", value: "Btn_Close_Normal, Btn_Close_Pressed, Btn_Close_Hover, Btn_Close_Disable" },
    { id: "bet-detail-title", path: "PopupControl/BetHistory/Container/DetailView/Title_BetDetail", value: "Title_BetHistory" },
    { id: "bet-detail-normal-bg", path: "PopupControl/BetHistory/Container/DetailView/SummaryView/GameMode/ItemWinNormalGame/Bg_1", value: "Bg_1" },
    { id: "bet-detail-normal-icon", path: "PopupControl/BetHistory/Container/DetailView/SummaryView/GameMode/ItemWinNormalGame/Icon", value: "Icon_NormalG" },
    { id: "bet-detail-free-bg", path: "PopupControl/BetHistory/Container/DetailView/SummaryView/GameMode/ItemWinFreeGame/Bg_1", value: "Bg_1" },
    { id: "bet-detail-free-icon", path: "PopupControl/BetHistory/Container/DetailView/SummaryView/GameMode/ItemWinFreeGame/Icon", value: "Icon_FreeG" },
    { id: "bet-detail-jackpot-bg", path: "PopupControl/BetHistory/Container/DetailView/SummaryView/GameMode/ItemWinJackpot/Bg_1", value: "Bg_1" },
    { id: "bet-detail-jackpot-icon", path: "PopupControl/BetHistory/Container/DetailView/SummaryView/GameMode/ItemWinJackpot/Icon", value: "Icon_Jackpot" },
    { id: "bet-detail-total-bg", path: "PopupControl/BetHistory/Container/DetailView/SummaryView/ItemWinTotal/Bg_1", value: "Bg_2" },
    { id: "bet-detail-prev-mode", path: "PopupControl/BetHistory/Container/DetailView/Controller/PrevModeBtn", value: "Btn_Next_Normal, Btn_Next_Pressed, Btn_Next_Hover, Btn_Next_Disable" },
    { id: "bet-detail-next-mode", path: "PopupControl/BetHistory/Container/DetailView/Controller/NextModeBtn", value: "Btn_Next_Normal, Btn_Next_Pressed, Btn_Next_Hover, Btn_Next_Disable" },
    { id: "bet-detail-back", path: "PopupControl/BetHistory/Container/DetailView/Controller/BackBtn", value: "Btn_Close_Normal, Btn_Close_Pressed, Btn_Close_Hover, Btn_Close_Disable" },
    { id: "tutorial-popup-bg", path: "PopupControl/TutorialPopup/PanelS_Half_L", value: "Panel_S" },
    { id: "tutorial-popup-title", path: "PopupControl/TutorialPopup/Title_Message", value: "Title_Notification" },
    { id: "tutorial-popup-cancel", path: "PopupControl/TutorialPopup/LayoutContent/LayoutBtn/BtnCancel", value: "Btn_Cancel_Normal, Btn_Cancel_Pressed, Btn_Cancel_Hover, Btn_Cancel_Disable" },
    { id: "tutorial-popup-confirm", path: "PopupControl/TutorialPopup/LayoutContent/LayoutBtn/BtnConfirm", value: "Btn_Confirm_Normal, Btn_Confirm_Pressed, Btn_Confirm_Hover, Btn_Confirm_Disable" },
    { id: "dialog-message-bg", path: "DialogMessage/PanelS_Half_L", value: "Panel_S" },
    { id: "dialog-message-title", path: "DialogMessage/Title_Message", value: "Title_Notification" },
    { id: "dialog-message-cancel", path: "DialogMessage/LayoutContent/LayoutBtn/BtnCancel", value: "Btn_Cancel_Normal, Btn_Cancel_Pressed, Btn_Cancel_Hover, Btn_Cancel_Disable" },
    { id: "dialog-message-confirm", path: "DialogMessage/LayoutContent/LayoutBtn/BtnConfirm", value: "Btn_Confirm_Normal, Btn_Confirm_Pressed, Btn_Confirm_Hover, Btn_Confirm_Disable" },
];

function getFileName(filePath: string) {
    return filePath.replace(/\\/g, "/").split("/").pop() || filePath;
}

function inferGameId(filePath: string) {
    return getFileName(filePath).match(/g?(\d{4})/i)?.[1] ?? "";
}

function createMappingRow(): MappingRow {
    return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        path: "",
        value: "",
    };
}

function createDefaultMappingRows() {
    return DEFAULT_MAPPING_ROWS.map((row) => ({ ...row }));
}

function stripGameIdPrefix(value: string) {
    return value
        .split(",")
        .map((item) => item.trim().replace(/^\d{4}_/, ""))
        .filter(Boolean)
        .join(", ");
}

function stripDefaultNodeRoot(path: string) {
    return path.trim().replace(/^Canvas\/Director\/?/, "");
}

function normalizeMappingRowValue(row: MappingRow): MappingRow {
    return { ...row, path: stripDefaultNodeRoot(row.path), value: stripGameIdPrefix(row.value) };
}

function serializeMappingRows(rows: MappingRow[]) {
    if (!Array.isArray(rows)) return "";
    return rows
        .map((row) => {
            const nodePath = row.path.trim();
            const value = row.value.trim();
            if (!nodePath) return "";
            return value ? `${nodePath} = ${value}` : nodePath;
        })
        .filter(Boolean)
        .join("\n");
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

export default function ReplaceSprite() {
    const [sceneFilePath, setSceneFilePath] = useStoredState<string>("replace-sprite-scene-file", "");
    const [gameId, setGameId] = useStoredState<string>("replace-sprite-game-id", "");
    const [mappingRows, setMappingRows] = useStoredState<MappingRow[]>("replace-sprite-mapping-rows", createDefaultMappingRows());
    const [result, setResult] = useState<ReplaceSpriteResult | null>(null);
    const [status, setStatus] = useState<{ type: "success" | "error" | null; message: string }>({
        type: null,
        message: "",
    });
    const [isLoading, setIsLoading] = useState(false);

    const resolvedGameId = gameId.trim() || inferGameId(sceneFilePath);
    const safeMappingRows = Array.isArray(mappingRows) ? mappingRows : createDefaultMappingRows();
    const mappings = serializeMappingRows(safeMappingRows);
    const mappingCount = safeMappingRows.filter((row) => row.path.trim()).length;

    useEffect(() => {
        setMappingRows((prev) => {
            const rows = (Array.isArray(prev) ? prev : createDefaultMappingRows()).map(normalizeMappingRowValue);
            const rowByPath = new Map(rows.map((row) => [row.path.trim(), row]));
            const defaultRows = DEFAULT_MAPPING_ROWS.map((defaultRow) => rowByPath.get(defaultRow.path) ?? defaultRow);
            const customRows = rows.filter((row) => !DEFAULT_MAPPING_ROWS.some((defaultRow) => defaultRow.path === row.path.trim()));
            return [...defaultRows, ...customRows];
        });
    }, [setMappingRows]);

    const handleSelectScene = async () => {
        const file = await window.electronAPI.replaceSprite.selectSceneFile();
        if (!file) return;
        setSceneFilePath(file);
        const nextGameId = inferGameId(file);
        if (nextGameId) {
            setGameId(nextGameId);
        }
        setResult(null);
    };

    const handleReplace = async () => {
        if (!sceneFilePath.trim() || !resolvedGameId || !mappings.trim()) {
            setStatus({ type: "error", message: "Please choose scene file, input game id, and add mappings." });
            return;
        }

        setIsLoading(true);
        setStatus({ type: null, message: "" });
        try {
            const nextResult = await window.electronAPI.replaceSprite.run(sceneFilePath, resolvedGameId, mappings);
            setResult(nextResult);
            setStatus({
                type: nextResult.replacedCount > 0 ? "success" : "error",
                message: nextResult.replacedCount > 0
                    ? `Replaced ${nextResult.replacedCount} sprite ref(s).`
                    : "No sprite refs replaced. Check detail list below.",
            });
        } catch (error: any) {
            setStatus({ type: "error", message: error.message || "Failed to replace sprite references." });
        } finally {
            setIsLoading(false);
        }
    };

    const updateMappingRow = (id: string, patch: Partial<MappingRow>) => {
        setMappingRows((prev) => (Array.isArray(prev) ? prev : createDefaultMappingRows()).map((row) => (row.id === id ? { ...row, ...patch } : row)));
    };

    const addMappingRow = () => {
        setMappingRows((prev) => [...(Array.isArray(prev) ? prev : createDefaultMappingRows()), createMappingRow()]);
    };

    const removeMappingRow = (id: string) => {
        setMappingRows((prev) => {
            const rows = Array.isArray(prev) ? prev : createDefaultMappingRows();
            return rows.length > 1 ? rows.filter((row) => row.id !== id) : [{ ...rows[0], path: "", value: "" }];
        });
    };

    const resetDefaultMappingRows = () => {
        setMappingRows(createDefaultMappingRows());
    };

    return (
        <div className="sm:col-span-2">
            <div className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-4 dark:border-zinc-700 md:flex-row md:items-center md:justify-between">
                <div className="text-left">
                    <h2 className="mb-1 text-2xl font-bold text-[#9b8cff]">Replace Sprite</h2>
                    <p className="text-xs text-slate-500 dark:text-zinc-400">
                        Replace Cocos 3.7.3 scene sprite refs by node name or node path
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
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-xs font-semibold text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                            Disconnect All Async Prefab and convert all target image assets to SpriteFrame before replacing.
                        </div>
                        <PathInput
                            label="Scene File"
                            value={sceneFilePath}
                            placeholder="Choose .scene"
                            onChange={setSceneFilePath}
                            onSelect={() => void handleSelectScene()}
                        />
                        <PathInput
                            label="Game ID"
                            value={resolvedGameId}
                            placeholder="9704"
                            onChange={setGameId}
                        />

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
                            <label className="pt-1 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
                                Mapping List <span className="text-red-500">*</span>
                            </label>
                            <div className="space-y-3">
                                <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] gap-2 px-1 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500 md:grid">
                                    <div>Node Path</div>
                                    <div>Asset Value</div>
                                    <div />
                                </div>
                                <div className="space-y-2">
                                    {safeMappingRows.map((row) => (
                                        <div key={row.id} className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px]">
                                            <input
                                                type="text"
                                                value={row.path}
                                                onChange={(event) => updateMappingRow(row.id, { path: event.target.value })}
                                                placeholder="GameMode/BG_MainG"
                                                spellCheck={false}
                                                className="min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-800 placeholder-slate-400 focus:outline-none dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-100 dark:placeholder-zinc-500"
                                            />
                                            <input
                                                type="text"
                                                value={row.value}
                                                onChange={(event) => updateMappingRow(row.id, { value: event.target.value })}
                                                placeholder="BG_MainG or Btn_Close_Normal, Btn_Close_Pressed"
                                                spellCheck={false}
                                                className="min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-800 placeholder-slate-400 focus:outline-none dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-100 dark:placeholder-zinc-500"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeMappingRow(row.id)}
                                                title="Remove row"
                                                aria-label="Remove row"
                                                className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-500 transition-all hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20">
                                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5.5h6V7M9 10.5v6M15 10.5v6M8 7l.6 12h6.8L16 7" />
                                                </svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={addMappingRow}
                                        className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-cyan-300/50 bg-cyan-50 px-4 py-2 text-xs font-semibold text-cyan-700 transition-all hover:bg-cyan-100 dark:border-cyan-300/20 dark:bg-cyan-400/10 dark:text-cyan-200 dark:hover:bg-cyan-400/15">
                                        Add Row
                                    </button>
                                    <button
                                        type="button"
                                        onClick={resetDefaultMappingRows}
                                        className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600 transition-all hover:bg-slate-100 dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-300 dark:hover:bg-[#232938]">
                                        Reset Default
                                    </button>
                                </div>
                                <p className="text-left text-xs text-slate-500 dark:text-zinc-400">
                                    Node path is relative to <span className="font-mono text-cyan-600 dark:text-cyan-300">Canvas/Director</span>. Asset value is prefixed by game id; multiple button states can be separated with <span className="font-mono">,</span>.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-zinc-700">
                        <div className="text-left text-xs text-slate-500 dark:text-zinc-400">
                            {mappingCount} mapping line(s) ready
                        </div>
                        <button
                            type="button"
                            onClick={() => void handleReplace()}
                            disabled={isLoading}
                            className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-[#7d6df7] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(125,109,247,0.25)] transition-all hover:bg-[#6c5ce7] disabled:cursor-not-allowed disabled:opacity-60">
                            {isLoading ? "Replacing..." : "Replace Sprite"}
                        </button>
                    </div>
                </div>
            </div>

            {result && (
                <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_36px_rgba(148,163,184,0.16)] dark:border-white/5 dark:bg-[#2b3140]">
                    <div className="border-b border-slate-200 p-5 dark:border-zinc-700">
                        <div className="grid grid-cols-2 gap-3 text-left text-sm md:grid-cols-3">
                            <div>
                                <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-500">Assets</div>
                                <div className="font-mono font-bold text-slate-800 dark:text-zinc-100">{result.scannedAssets}</div>
                            </div>
                            <div>
                                <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-500">Mappings</div>
                                <div className="font-mono font-bold text-slate-800 dark:text-zinc-100">{result.mappingCount}</div>
                            </div>
                            <div>
                                <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-500">Replaced</div>
                                <div className="font-mono font-bold text-emerald-600 dark:text-emerald-300">{result.replacedCount}</div>
                            </div>
                        </div>
                    </div>
                    <div className="max-h-[420px] overflow-auto p-5">
                        <div className="space-y-2">
                            {result.details.map((detail, index) => (
                                <div
                                    key={`${detail.mapping}-${index}`}
                                    className={`rounded-xl border px-4 py-3 text-left text-xs ${
                                        detail.status === "replaced"
                                            ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200"
                                            : "border-red-200 bg-red-50 text-red-900 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200"
                                    }`}>
                                    <div className="font-mono font-bold">{detail.mapping}</div>
                                    <div className="mt-1 text-slate-600 dark:text-zinc-300">{detail.message}</div>
                                    {detail.assetName && (
                                        <div className="mt-1 font-mono text-[11px] opacity-80">asset: {detail.assetName}</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
