import { useState, useEffect, useRef } from "react";
import { useStoredState } from "../hooks/useStoredState";

interface CheatLocalSocketStatus {
    enabled: boolean;
    running: boolean;
    host: string;
    port: number;
    clientCount: number;
    lastEventAt: number | null;
    lastEventType: string | null;
    lastError: string | null;
}

interface CheatSocketEventPayload {
    type: string;
    command?: string;
    source?: string;
    debugType?: string;
    gameId?: string | null;
    eventName?: string;
    timestamp?: number;
    payload?: {
        gameId?: string | null;
        serviceId?: string;
        eventId?: string | null;
        data?: {
            gameId?: string | null;
            mx?: string[];
            [key: string]: unknown;
        };
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

const ACCEPTED_AUTOPLAY_EVENT_NAMES = new Set(["n", "f"]);
const SHOW_AUTOPLAY_DEBUG_LOGS = false;
const LOCAL_SOCKET_CLIENT_WAIT_MS = 4000;
const LOCAL_SOCKET_CLIENT_POLL_MS = 250;

interface PanelData {
    id: string;
    title: string;
    matrixData: string;
    tableFormat: string;
    jackpotTypeLeft: string;
    isExpanded: boolean;
    delay?: number;
    // Additional Data (tất cả optional), hiển thị trong section có thể expand
    isAdditionalExpanded?: boolean;
    stackedReel1?: string;
    stackedReel5?: string;
    stackedCodeReel1?: string;
    stackedCodeReel5?: string;
    megaSymbolCode?: string;
    megaSymbolFormat?: string;
    jackpotTypeRight?: string;
    powerUpSymbolCode?: string;
    matrixLightningData?: string;
    jackpotType?: string;
}

// Các field optional trong mục Additional Data. `key` cũng chính là tên field POST lên server.
const ADDITIONAL_FIELDS: { key: keyof PanelData; label: string }[] = [
    { key: "stackedReel1", label: "Stacked Reel 1" },
    { key: "stackedReel5", label: "Stacked Reel 5" },
    { key: "stackedCodeReel1", label: "Stacked Code Reel 1" },
    { key: "stackedCodeReel5", label: "Stacked Code Reel 5" },
    { key: "megaSymbolCode", label: "Mega Symbol Code" },
    { key: "megaSymbolFormat", label: "Mega Symbol Format" },
    { key: "jackpotTypeLeft", label: "Jackpot Type Left" },
    { key: "jackpotTypeRight", label: "Jackpot Type Right" },
    { key: "powerUpSymbolCode", label: "Power Up Symbol Code" },
    { key: "matrixLightningData", label: "Matrix Lightning Data" },
    { key: "jackpotType", label: "Jackpot Type" },
];

interface FieldConfig {
    key: keyof PanelData;
    label: string;
    visible: boolean;
}

function getDefaultFieldConfig(): FieldConfig[] {
    return ADDITIONAL_FIELDS.map(f => ({ ...f, visible: true }));
}

function getResolvedFieldConfig(fieldConfig?: FieldConfig[]): FieldConfig[] {
    if (!fieldConfig || fieldConfig.length === 0) {
        return getDefaultFieldConfig();
    }

    const fieldConfigMap = new Map(fieldConfig.map((field) => [field.key, field]));

    return ADDITIONAL_FIELDS.map((field) => {
        const savedField = fieldConfigMap.get(field.key);
        return savedField
            ? { ...field, ...savedField }
            : { ...field, visible: true };
    });
}

// Append mọi field Additional Data có giá trị vào body POST (chỉ field visible).
function appendAdditionalData(data: URLSearchParams, panel: PanelData, fieldConfig: FieldConfig[]) {
    for (const { key, visible } of fieldConfig) {
        if (!visible) continue;
        const val = panel[key];
        if (typeof val === "string" && val.trim()) {
            data.append(key, val.trim());
        }
    }
}

function parseTableFormat(tableFormat: string): number[] {
    return tableFormat
        .split(/[,\s;|xX]+/)
        .map((part) => parseInt(part.trim(), 10))
        .filter((value) => Number.isFinite(value) && value > 0);
}

function parseMatrixTokens(matrixData: string, options?: { preserveEmpty?: boolean }): string[] {
    const sanitized = matrixData.replace(/[\[\](){}]/g, " ").trim();

    if (!sanitized) {
        return [];
    }

    if (/[;,|]/.test(sanitized) || sanitized.includes(",")) {
        const tokens = sanitized.split(/[;,|]/).map((token) => token.trim());
        return options?.preserveEmpty ? tokens : tokens.filter(Boolean);
    }

    return sanitized
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean);
}

function buildMatrixPreview(matrixData: string, tableFormat: string) {
    const format = parseTableFormat(tableFormat);
    const tokens = parseMatrixTokens(matrixData, { preserveEmpty: true });
    let cursor = 0;
    const columns = format.map((count) => {
        const start = cursor;
        const column = tokens.slice(start, start + count);
        cursor += count;
        return Array.from({ length: count }, (_, index) => ({
            tokenIndex: start + index,
            value: column[index] ?? "",
        }));
    });

    return {
        columns,
        expected: format.reduce((sum, count) => sum + count, 0),
        total: tokens.length,
        extra: tokens.slice(cursor),
        isFormatValid: format.length > 0,
    };
}

function updateMatrixToken(matrixData: string, tokenIndex: number, value: string): string {
    const tokens = parseMatrixTokens(matrixData, { preserveEmpty: true });
    const nextTokens = [...tokens];
    nextTokens[tokenIndex] = value.trim();

    while (nextTokens.length > 0 && !nextTokens[nextTokens.length - 1]) {
        nextTokens.pop();
    }

    return nextTokens.join(",");
}

interface GameData {
    id: string;
    name: string;
    userId: string;
    env: "staging" | "dev";
    panels: PanelData[];
    fieldConfig?: FieldConfig[];
}

export default function CheatConsole() {
    const [games, setGames] = useStoredState<GameData[]>("games", []);
    const [selectedGameId, setSelectedGameId] = useStoredState<string | null>("selectedGameId", null);
    const [localSocketEnabled, setLocalSocketEnabled] = useStoredState<boolean>("cheat-matrix-local-ws-enabled", false);

    const activeGame = games.find((g) => g.id === selectedGameId);

    const [isCreatingGame, setIsCreatingGame] = useState(false);
    const [newGameId, setNewGameId] = useState("");
    const [newGameName, setNewGameName] = useState("");

    const [executingPanelId, setExecutingPanelId] = useState<string | null>(null);
    const [clearingSession, setClearingSession] = useState(false);
    const [status, setStatus] = useState<{
        type: "success" | "error" | null;
        message: string;
    }>({
        type: null,
        message: "",
    });

    const [autoplaySelectedIds, setAutoplaySelectedIds] = useState<string[]>([]);
    const [isAutoplayRunning, setIsAutoplayRunning] = useState<boolean>(false);
    const [autoplayLogs, setAutoplayLogs] = useState<string[]>([]);
    const [autoplayCurrentId, setAutoplayCurrentId] = useState<string | null>(null);
    const [isAutoplaySequenceExpanded, setIsAutoplaySequenceExpanded] = useState<boolean>(false);
    const autoplayAbortRef = useRef<AbortController | null>(null);
    const matrixCellAnimationTimeoutRef = useRef<number | null>(null);
    const [isCommonDataOpen, setIsCommonDataOpen] = useState(true);
    const [isFieldConfigOpen, setIsFieldConfigOpen] = useState(false);
    const [animatedMatrixCell, setAnimatedMatrixCell] = useState<string | null>(null);
    const [localSocketStatus, setLocalSocketStatus] = useState<CheatLocalSocketStatus>({
        enabled: false,
        running: false,
        host: "127.0.0.1",
        port: 17381,
        clientCount: 0,
        lastEventAt: null,
        lastEventType: null,
        lastError: null,
    });
    const latestSocketEventRef = useRef<CheatSocketEventPayload | null>(null);
    const socketEventSequenceRef = useRef(0);
    const gamesRef = useRef<GameData[]>(games);
    const selectedGameIdRef = useRef<string | null>(selectedGameId);
    const activeGameRef = useRef<GameData | undefined>(activeGame);
    const localSocketStatusRef = useRef<CheatLocalSocketStatus>(localSocketStatus);
    const autoplaySelectedIdsRef = useRef<string[]>(autoplaySelectedIds);

    const appendAutoplayLog = (message: string, options?: { debug?: boolean }) => {
        if (options?.debug && !SHOW_AUTOPLAY_DEBUG_LOGS) {
            return;
        }

        setAutoplayLogs((prev) => [...prev, message]);
    };

    const resolveExtensionRequestedGameId = (event: CheatSocketEventPayload) => {
        if (typeof event.gameId === "string" && event.gameId.trim()) {
            return event.gameId.trim();
        }

        if (typeof event.payload?.gameId === "string" && event.payload.gameId.trim()) {
            return event.payload.gameId.trim();
        }

        if (typeof event.payload?.data?.gameId === "string" && event.payload.data.gameId.trim()) {
            return event.payload.data.gameId.trim();
        }

        return null;
    };

    const isAcceptedAutoplaySocketEvent = (event: CheatSocketEventPayload | null | undefined, gameId: string) => {
        if (!event || event.type !== "game-socket-response") {
            return false;
        }

        if (!event.eventName || !ACCEPTED_AUTOPLAY_EVENT_NAMES.has(event.eventName)) {
            return false;
        }

        const eventGameId = typeof event.gameId === "string"
            ? event.gameId
            : typeof event.payload?.serviceId === "string"
                ? event.payload.serviceId
                : null;

        if (eventGameId && eventGameId !== gameId) {
            return false;
        }

        return true;
    };

    useEffect(() => {
        gamesRef.current = games;
    }, [games]);

    useEffect(() => {
        selectedGameIdRef.current = selectedGameId;
    }, [selectedGameId]);

    useEffect(() => {
        activeGameRef.current = activeGame;
    }, [activeGame]);

    useEffect(() => {
        localSocketStatusRef.current = localSocketStatus;
    }, [localSocketStatus]);

    useEffect(() => {
        autoplaySelectedIdsRef.current = autoplaySelectedIds;
    }, [autoplaySelectedIds]);

    useEffect(() => {
        if (activeGame) {
            setAutoplaySelectedIds(activeGame.panels.map((p) => p.id));
        } else {
            setAutoplaySelectedIds([]);
        }

        if (autoplayAbortRef.current) {
            autoplayAbortRef.current.abort();
            autoplayAbortRef.current = null;
        }
        setIsAutoplayRunning(false);
        setAutoplayLogs([]);
        setAutoplayCurrentId(null);
    }, [selectedGameId]);

    useEffect(() => {
        if (activeGame) {
            const panelIds = activeGame.panels.map((p) => p.id);
            setAutoplaySelectedIds((prev) => {
                const validPrev = prev.filter((id) => panelIds.includes(id));
                const newIds = panelIds.filter((id) => !prev.includes(id));
                return [...validPrev, ...newIds];
            });
        }
    }, [activeGame?.panels?.length]);

    useEffect(() => {
        return () => {
            if (autoplayAbortRef.current) {
                autoplayAbortRef.current.abort();
            }
            if (matrixCellAnimationTimeoutRef.current) {
                window.clearTimeout(matrixCellAnimationTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        let isMounted = true;
        let removeStatusListener = () => {};
        let removeEventListener = () => {};

        void window.electronAPI.cheatLocalSocket.status().then((nextStatus) => {
            if (isMounted) {
                setLocalSocketStatus(nextStatus);
            }
        });

        removeStatusListener = window.electronAPI.cheatLocalSocket.onStatus((nextStatus) => {
            if (isMounted) {
                setLocalSocketStatus(nextStatus);
            }
        });

        removeEventListener = window.electronAPI.cheatLocalSocket.onEvent((event) => {
            if (!isMounted) return;

            latestSocketEventRef.current = event as CheatSocketEventPayload;
            socketEventSequenceRef.current += 1;

            const eventType = typeof event?.type === "string" ? event.type : "unknown";
            const eventName = typeof event?.eventName === "string" ? event.eventName : null;
            const eventGameId = typeof event?.gameId === "string" ? event.gameId : null;
            const debugType = typeof event?.debugType === "string" ? event.debugType : null;
            const socketPayload = event?.payload as CheatSocketEventPayload["payload"] | undefined;
            const eventId = typeof socketPayload?.eventId === "string" ? socketPayload.eventId : null;
            const displayLabel = [eventType, debugType, eventName, eventGameId, eventId].filter(Boolean).join(" / ");
            const preview = typeof socketPayload?.preview === "string" ? socketPayload.preview : null;

            if (eventType === "extension-command" && (event as CheatSocketEventPayload).command === "start-autoplay") {
                runAutoplayFromExtension(resolveExtensionRequestedGameId(event as CheatSocketEventPayload));
                return;
            }

            appendAutoplayLog(
                `📡 Received socket event: ${displayLabel || "unknown"}${preview ? ` | ${preview}` : ""}`,
                {
                    debug: eventType !== "game-socket-response",
                },
            );
        });

        return () => {
            isMounted = false;
            removeStatusListener();
            removeEventListener();
        };
    }, []);

    useEffect(() => {
        void (async () => {
            try {
                if (localSocketEnabled) {
                    const nextStatus = await window.electronAPI.cheatLocalSocket.start();
                    setLocalSocketStatus(nextStatus);
                    const connectedStatus = await waitForLocalSocketClient(nextStatus);
                    setLocalSocketStatus(connectedStatus);

                    if (connectedStatus.clientCount > 0) {
                        setStatus({
                            type: "success",
                            message: "🔌 Electron Local WebSocket Server đã bật và web client đã kết nối.",
                        });
                    } else {
                        setStatus({
                            type: "success",
                            message: "🟡 Electron Local WebSocket Server đã bật, nhưng chưa thấy web client kết nối. Hãy kiểm tra extension đang bật và reload tab game nếu cần.",
                        });
                    }
                    return;
                }

                const nextStatus = await window.electronAPI.cheatLocalSocket.stop();
                setLocalSocketStatus(nextStatus);
            } catch (error) {
                setStatus({
                    type: "error",
                    message: error instanceof Error
                        ? `❌ Local WebSocket error: ${error.message}`
                        : "❌ Không thể cập nhật Local WebSocket Server.",
                });
            }
        })();
    }, [localSocketEnabled]);

    const waitForLocalSocketClient = async (initialStatus: CheatLocalSocketStatus) => {
        if (initialStatus.clientCount > 0) {
            return initialStatus;
        }

        const startedAt = Date.now();
        let latestStatus = initialStatus;

        while (Date.now() - startedAt < LOCAL_SOCKET_CLIENT_WAIT_MS) {
            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, LOCAL_SOCKET_CLIENT_POLL_MS);
            });

            latestStatus = await window.electronAPI.cheatLocalSocket.status();
            if (latestStatus.clientCount > 0 || !latestStatus.running) {
                return latestStatus;
            }
        }

        return latestStatus;
    };

    const runAutoplayFromExtension = (requestedGameId?: string | null) => {
        if (isAutoplayRunning) {
            setAutoplayLogs((prev) => [...prev, "📥 Received extension command: start-autoplay (ignored because autoplay is already running)."]);
            return;
        }

        const targetGameId = typeof requestedGameId === "string" && requestedGameId.trim()
            ? requestedGameId.trim()
            : selectedGameIdRef.current;
        const targetGame = targetGameId
            ? gamesRef.current.find((game) => game.id === targetGameId)
            : activeGameRef.current ?? null;

        if (!targetGame) {
            setAutoplayLogs((prev) => [...prev, `📥 Received extension command: start-autoplay${targetGameId ? ` for game ${targetGameId}` : ""}.`]);
            setAutoplayLogs((prev) => [...prev, "❌ Cannot start autoplay from extension: game was not found in Electron."]);
            return;
        }

        if (selectedGameIdRef.current !== targetGame.id) {
            setSelectedGameId(targetGame.id);
        }

        if (!localSocketStatusRef.current.running) {
            setAutoplayLogs((prev) => [...prev, `📥 Received extension command: start-autoplay for game ${targetGame.id}.`]);
            setAutoplayLogs((prev) => [...prev, "❌ Cannot start autoplay from extension: Electron Local WebSocket Server is not running."]);
            return;
        }

        if (targetGame.panels.length === 0) {
            setAutoplayLogs((prev) => [...prev, `📥 Received extension command: start-autoplay for game ${targetGame.id}.`]);
            setAutoplayLogs((prev) => [...prev, "❌ Cannot start autoplay from extension: selected game has no configured panels."]);
            return;
        }

        if (autoplaySelectedIdsRef.current.length === 0) {
            setAutoplaySelectedIds(targetGame.panels.map((panel) => panel.id));
        }

        if ((autoplaySelectedIdsRef.current.length === 0 ? targetGame.panels.length : autoplaySelectedIdsRef.current.length) === 0) {
            setAutoplayLogs((prev) => [...prev, `📥 Received extension command: start-autoplay for game ${targetGame.id}.`]);
            setAutoplayLogs((prev) => [...prev, "❌ Cannot start autoplay from extension: no autoplay steps are selected."]);
            return;
        }

        if (!targetGame.userId.trim()) {
            setAutoplayLogs((prev) => [...prev, `📥 Received extension command: start-autoplay for game ${targetGame.id}.`]);
            setAutoplayLogs((prev) => [...prev, "❌ Cannot start autoplay from extension: User ID is empty."]);
            return;
        }

        setStatus({
            type: "success",
            message: "⚡ Extension đã gửi lệnh Start Autoplay cho Electron app.",
        });
        setAutoplayLogs((prev) => [...prev, `📥 Received extension command: start-autoplay for game ${targetGame.id}.`]);
        setAutoplayLogs((prev) => [...prev, "⚡ Electron is starting autoplay from extension command..."]);
        void runAutoplay(targetGame);
    };

    const updateActiveGameUserId = (val: string) => {
        setGames((prev) =>
            prev.map((g) => (g.id === selectedGameId ? { ...g, userId: val } : g))
        );
    };

    const updateActiveGamePanels = (updater: PanelData[] | ((prev: PanelData[]) => PanelData[])) => {
        setGames((prev) =>
            prev.map((g) => {
                if (g.id === selectedGameId) {
                    const newPanels = typeof updater === "function" ? updater(g.panels) : updater;
                    return { ...g, panels: newPanels };
                }
                return g;
            })
        );
    };

    const handleCreateGame = (e: React.FormEvent) => {
        e.preventDefault();
        const cleanedId = newGameId.trim();
        const cleanedName = newGameName.trim();

        if (!cleanedId || !cleanedName) {
            setStatus({ type: "error", message: "❌ Vui lòng nhập đầy đủ Game ID và Game Name!" });
            return;
        }

        if (games.some((g) => g.id === cleanedId)) {
            setStatus({ type: "error", message: `❌ Game ID ${cleanedId} đã tồn tại!` });
            return;
        }

        const newGame: GameData = {
            id: cleanedId,
            name: cleanedName,
            userId: "",
            env: "staging",
            panels: [],
        };

        setGames((prev) => [...prev, newGame]);
        setNewGameId("");
        setNewGameName("");
        setIsCreatingGame(false);
        setStatus({ type: "success", message: `🚀 Đã tạo thành công game "${cleanedName}" (ID: ${cleanedId})!` });
    };

    const handleDeleteGame = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (selectedGameId === id) {
            setSelectedGameId(null);
        }
        setGames((prev) => prev.filter((g) => g.id !== id));
        setStatus({ type: "success", message: "🗑️ Đã xóa game khỏi danh sách!" });
    };

    const updatePanelField = (panelId: string, field: keyof PanelData, value: string) => {
        updateActiveGamePanels((prev) =>
            prev.map((p) => (p.id === panelId ? { ...p, [field]: value } : p))
        );
    };

    const updatePanelMatrixToken = (panel: PanelData, tokenIndex: number, value: string) => {
        updatePanelField(panel.id, "matrixData", updateMatrixToken(panel.matrixData, tokenIndex, value));
        const cellId = `${panel.id}-${tokenIndex}`;
        setAnimatedMatrixCell(cellId);
        if (matrixCellAnimationTimeoutRef.current) {
            window.clearTimeout(matrixCellAnimationTimeoutRef.current);
        }
        matrixCellAnimationTimeoutRef.current = window.setTimeout(() => {
            setAnimatedMatrixCell((current) => (current === cellId ? null : current));
        }, 450);
    };

    const toggleExpand = (panelId: string) => {
        updateActiveGamePanels((prev) =>
            prev.map((p) => (p.id === panelId ? { ...p, isExpanded: !p.isExpanded } : p))
        );
    };

    const toggleAdditionalExpand = (panelId: string) => {
        updateActiveGamePanels((prev) =>
            prev.map((p) => (p.id === panelId ? { ...p, isAdditionalExpanded: !p.isAdditionalExpanded } : p))
        );
    };

    const addPanel = () => {
        if (!activeGame) return;
        const newId = (
            Math.max(...activeGame.panels.map((p) => parseInt(p.id) || 0), 0) + 1
        ).toString();
        updateActiveGamePanels((prev) => [
            ...prev,
            {
                id: newId,
                title: "",
                matrixData: "",
                tableFormat: "3,3,3,3,3",
                jackpotTypeLeft: "",
                isExpanded: true,
                delay: 2,
            },
        ]);
    };

    const removePanel = (panelId: string) => {
        if (!activeGame) return;
        updateActiveGamePanels((prev) => prev.filter((p) => p.id !== panelId));
    };

    const executePanel = async (panel: PanelData) => {
        if (!activeGame) return;
        const gameId = activeGame.id;
        const userId = activeGame.userId;

        if (!userId.trim()) {
            setStatus({ type: "error", message: "❌ Vui lòng nhập User ID!" });
            return;
        }
        if (!panel.matrixData.trim()) {
            setStatus({ type: "error", message: "❌ Vui lòng nhập Matrix cho Panel #" + panel.id + "!" });
            return;
        }
        if (!panel.tableFormat.trim()) {
            setStatus({ type: "error", message: "❌ Vui lòng nhập Table Format cho Panel #" + panel.id + "!" });
            return;
        }

        setExecutingPanelId(panel.id);
        setStatus({ type: null, message: "" });

        const submitTargetUrl = `https://cheat.${activeGame.env}.enostd.gay/${gameId}/inputed`;

        const urlEncodedData = new URLSearchParams();
        urlEncodedData.append("userId", userId);
        urlEncodedData.append("matrixData", panel.matrixData);
        urlEncodedData.append("tableFormat", panel.tableFormat);
        appendAdditionalData(urlEncodedData, panel, getResolvedFieldConfig(activeGame.fieldConfig));

        try {
            const response = await fetch(submitTargetUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: urlEncodedData.toString(),
            });

            if (response.ok) {
                setStatus({
                    type: "success",
                    message: `🚀 Execute Cheat [Panel #${panel.id}] thành công! Máy chủ đã ghi nhận thông số mới.`,
                });
            } else {
                setStatus({
                    type: "error",
                    message: `❌ Thất bại [Panel #${panel.id}]! Máy chủ phản hồi mã lỗi: ${response.status}`,
                });
            }
        } catch (error) {
            setStatus({
                type: "error",
                message: `❌ Lỗi kết nối mạng hoặc server chặn CORS Request [Panel #${panel.id}]!`,
            });
        } finally {
            setExecutingPanelId(null);
        }
    };

    const handleClearSession = async () => {
        if (!activeGame) return;
        const gameId = activeGame.id;
        const userId = activeGame.userId;

        if (!userId.trim()) {
            setStatus({ type: "error", message: "❌ Vui lòng nhập User ID để Clear Session!" });
            return;
        }

        setClearingSession(true);
        setStatus({ type: null, message: "" });

        const clearUrl = `https://cheat.staging.enostd.gay/${gameId}/clearsession`;
        const urlEncodedData = new URLSearchParams();
        urlEncodedData.append("userId", userId);
        urlEncodedData.append("currency", "USD");

        try {
            const response = await fetch(clearUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: urlEncodedData.toString(),
            });

            if (response.ok) {
                setStatus({
                    type: "success",
                    message: "🚀 Clear Session thành công! Máy chủ đã thiết lập lại phiên chơi.",
                });
            } else {
                setStatus({
                    type: "error",
                    message: `❌ Thất bại! Máy chủ phản hồi mã lỗi: ${response.status}`,
                });
            }
        } catch (error) {
            setStatus({
                type: "error",
                message: "❌ Lỗi kết nối mạng hoặc server chặn CORS Request khi Clear Session!",
            });
        } finally {
            setClearingSession(false);
        }
    };

    const stopAutoplay = () => {
        if (autoplayAbortRef.current) {
            autoplayAbortRef.current.abort();
            autoplayAbortRef.current = null;
        }
        setIsAutoplayRunning(false);
        setAutoplayCurrentId(null);
        setAutoplayLogs((prev) => [...prev, "🛑 Đã dừng chạy tự động."]);
    };

    const runAutoplay = async (overrideGame?: GameData) => {
        const gameToRun = overrideGame ?? activeGameRef.current;
        const isExternalOverride = Boolean(overrideGame);
        if (!gameToRun) {
            setAutoplayLogs((prev) => [...prev, "❌ Cannot start autoplay: no active game is available in Electron."]);
            return;
        }
        if (!localSocketStatusRef.current.running) {
            setStatus({
                type: "error",
                message: "❌ Autoplay chỉ hoạt động khi Local WebSocket Server đang bật.",
            });
            setAutoplayLogs((prev) => [...prev, `❌ Cannot start autoplay for game ${gameToRun.id}: Electron Local WebSocket Server is not running.`]);
            return;
        }
        const selectedIds = autoplaySelectedIdsRef.current.length > 0
            ? autoplaySelectedIdsRef.current
            : gameToRun.panels.map((panel) => panel.id);

        if (selectedIds.length === 0) {
            setStatus({ type: "error", message: "❌ Vui lòng chọn ít nhất 1 bước để Autoplay!" });
            setAutoplayLogs((prev) => [...prev, `❌ Cannot start autoplay for game ${gameToRun.id}: no autoplay steps are selected.`]);
            return;
        }
        const userId = gameToRun.userId;
        if (!userId.trim()) {
            setStatus({ type: "error", message: "❌ Vui lòng nhập User ID trước khi chạy Autoplay!" });
            setAutoplayLogs((prev) => [...prev, `❌ Cannot start autoplay for game ${gameToRun.id}: User ID is empty.`]);
            return;
        }

        if (!isExternalOverride && selectedGameIdRef.current !== gameToRun.id) {
            setSelectedGameId(gameToRun.id);
        }
        if (!isExternalOverride && autoplaySelectedIdsRef.current.length === 0) {
            setAutoplaySelectedIds(selectedIds);
        }

        setIsAutoplayRunning(true);
        setAutoplayLogs(["🚀 Bắt đầu Autoplay chuỗi Matrix..."]);

        const controller = new AbortController();
        autoplayAbortRef.current = controller;

        try {
            const panelsToExecute = gameToRun.panels.filter((p) =>
                selectedIds.includes(p.id)
            );

            for (let i = 0; i < panelsToExecute.length; i++) {
                const panel = panelsToExecute[i];
                setAutoplayCurrentId(panel.id);

                if (controller.signal.aborted) break;

                const displayName = panel.title.trim() ? panel.title : `Matrix #${panel.id}`;
                setAutoplayLogs((prev) => [...prev, `⚡ Đang chạy: ${displayName}...`]);
                const socketSequenceBeforeSubmit = socketEventSequenceRef.current;

                const submitTargetUrl = `https://cheat.${gameToRun.env}.enostd.gay/${gameToRun.id}/inputed`;
                const urlEncodedData = new URLSearchParams();
                urlEncodedData.append("userId", userId);
                urlEncodedData.append("matrixData", panel.matrixData);
                urlEncodedData.append("tableFormat", panel.tableFormat);
                appendAdditionalData(urlEncodedData, panel, getResolvedFieldConfig(gameToRun.fieldConfig));

                const response = await fetch(submitTargetUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    body: urlEncodedData.toString(),
                    signal: controller.signal,
                });

                if (response.ok) {
                    setAutoplayLogs((prev) => [
                        ...prev,
                        `✅ Thành công: ${displayName}`,
                        "⏳ Waiting for local socket event before next step...",
                    ]);

                    if (i < panelsToExecute.length - 1) {
                        await new Promise<void>((resolve, reject) => {
                            let resolved = false;
                            const latestEvent = latestSocketEventRef.current;
                            const socketSequenceAfterSubmit = socketEventSequenceRef.current;

                            if (
                                socketSequenceAfterSubmit > socketSequenceBeforeSubmit &&
                                isAcceptedAutoplaySocketEvent(latestEvent, gameToRun.id)
                            ) {
                                setAutoplayLogs((prev) => [
                                    ...prev,
                                    "🧭 Detected matching socket event arrived during request. Continuing immediately.",
                                ]);
                                resolve();
                                return;
                            }

                            const removeListener = window.electronAPI.cheatLocalSocket.onEvent((event) => {
                                const socketEvent = event as CheatSocketEventPayload;
                                if (socketEvent.type !== "game-socket-response") {
                                    appendAutoplayLog(`🪵 Ignored socket event type: ${socketEvent.type || "unknown"}`, {
                                        debug: true,
                                    });
                                    return;
                                }
                                if (!socketEvent.eventName || !ACCEPTED_AUTOPLAY_EVENT_NAMES.has(socketEvent.eventName)) {
                                    appendAutoplayLog(`🪵 Ignored socket event name: ${socketEvent.eventName || "unknown"}`, {
                                        debug: true,
                                    });
                                    return;
                                }

                                const eventGameId = typeof socketEvent.gameId === "string"
                                    ? socketEvent.gameId
                                    : typeof socketEvent.payload?.serviceId === "string"
                                        ? socketEvent.payload.serviceId
                                        : null;

                                if (eventGameId && eventGameId !== gameToRun.id) {
                                    appendAutoplayLog(`🪵 Ignored socket event for game: ${eventGameId}`, {
                                        debug: true,
                                    });
                                    return;
                                }

                                if (resolved) return;
                                resolved = true;
                                removeListener();
                                clearTimeout(timeoutId);
                                setAutoplayLogs((prev) => [...prev, `✅ Accepted socket event: ${socketEvent.eventName || "unknown"}`]);
                                resolve();
                            });

                            const timeoutId = window.setTimeout(() => {
                                if (resolved) return;
                                resolved = true;
                                removeListener();
                                reject(new Error("socket-timeout"));
                            }, 15000);

                            controller.signal.addEventListener("abort", () => {
                                if (resolved) return;
                                resolved = true;
                                removeListener();
                                clearTimeout(timeoutId);
                                reject(new Error("aborted"));
                            }, { once: true });
                        });
                    }
                } else {
                    setAutoplayLogs((prev) => [
                        ...prev,
                        `❌ Thất bại: ${displayName} (Mã lỗi: ${response.status})`
                    ]);
                }
            }

            if (!controller.signal.aborted) {
                setAutoplayLogs((prev) => [...prev, "🎉 Hoàn thành autoplay tất cả các bước!"]);
            }
        } catch (error: any) {
            if (error.name !== "AbortError" && error.message !== "aborted") {
                setAutoplayLogs((prev) => [
                    ...prev,
                    error.message === "socket-timeout"
                        ? "❌ Timeout khi chờ socket event để chạy bước tiếp theo."
                        : `❌ Gặp lỗi trong quá trình Autoplay: ${error.message || error}`
                ]);
            }
        } finally {
            setIsAutoplayRunning(false);
            setAutoplayCurrentId(null);
            if (autoplayAbortRef.current === controller) {
                autoplayAbortRef.current = null;
            }
        }
    };

    const handleClearAll = () => {
        if (!selectedGameId) return;
        setGames((prev) =>
            prev.map((g) =>
                g.id === selectedGameId
                    ? {
                          ...g,
                          userId: "",
                          panels: [],
                      }
                    : g
            )
        );
        setStatus({
            type: "success",
            message: "🧹 Đã xóa toàn bộ cấu hình form và đặt lại danh sách panel cho game này!",
        });
    };

    return (
        <div>
            <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 dark:border-zinc-700 pb-4">
                <div className="flex items-center gap-3">
                    {selectedGameId && (
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedGameId(null);
                                setStatus({ type: null, message: "" });
                            }}
                            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-all cursor-pointer text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-slate-200"
                            title="Quay lại danh sách game">
                            ⬅️ Back
                        </button>
                    )}
                    <div className="text-left">
                        <h2 className="text-2xl font-bold text-[#9b8cff] mb-1">
                            Matrix Simulator
                        </h2>
                        <p className="text-slate-400 text-xs">
                            {selectedGameId && activeGame
                                ? `Đang chỉnh cấu hình cho: ${activeGame.id} - ${activeGame.name}`
                                : "Quản lý danh sách game và cấu hình cheat"}
                        </p>
                    </div>
                </div>
                {!selectedGameId && (
                    <button
                        type="button"
                        onClick={() => setIsCreatingGame((prev) => !prev)}
                        className="px-4 py-2 bg-red-600 text-white font-bold text-xs rounded-xl hover:bg-red-500 transition-all cursor-pointer shadow-md shadow-red-500/10">
                        {isCreatingGame ? "✕ Close Form" : "➕ Create New Game"}
                    </button>
                )}
            </div>

            <div className={`min-h-[400px] overflow-hidden ${
                selectedGameId
                    ? "bg-[#2b3140] border border-white/5 rounded-2xl shadow-[0_18px_36px_rgba(10,12,18,0.28)]"
                    : ""
            }`}>
                <div>
                    {status.type && (
                        <div className="px-6 pt-6">
                            <div
                                className={`mb-6 p-4 rounded-xl border text-sm font-medium transition-all ${
                                    status.type === "success"
                                        ? "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-400"
                                        : "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700 text-red-800 dark:text-red-400"
                                }`}>
                                {status.message}
                            </div>
                        </div>
                    )}

                    {/* MÀN HÌNH 1: DANH SÁCH GAME */}
                    {!selectedGameId ? (
                        <div className="space-y-6">
                            {/* Form tạo game mới nếu bật */}
                            {isCreatingGame && (
                                <form
                                    onSubmit={handleCreateGame}
                                    className="bg-slate-50 dark:bg-zinc-800 border border-red-200 dark:border-red-700 p-5 rounded-2xl space-y-4 shadow-sm animate-in fade-in duration-200">
                                    <div className="flex items-center gap-2 border-b border-slate-200 dark:border-zinc-600 pb-2 mb-1">
                                        <span className="text-sm">🎮</span>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 font-mono">
                                            Create New Game
                                        </h3>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs text-slate-500 font-medium mb-1">Game ID *</label>
                                            <input
                                                type="text"
                                                required
                                                value={newGameId}
                                                onChange={(e) => setNewGameId(e.target.value)}
                                                placeholder="e.g., 9704"
                                                className="w-full px-4 py-2.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-600 rounded-xl text-slate-800 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/20"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-slate-500 font-medium mb-1">Game Name *</label>
                                            <input
                                                type="text"
                                                required
                                                value={newGameName}
                                                onChange={(e) => setNewGameName(e.target.value)}
                                                placeholder="e.g., Slot Game"
                                                className="w-full px-4 py-2.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-600 rounded-xl text-slate-800 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/20"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-end pt-1">
                                        <button
                                            type="submit"
                                            className="px-5 py-2 bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold rounded-xl cursor-pointer transition-all">
                                            Save & Add Game
                                        </button>
                                    </div>
                                </form>
                            )}

                            {/* Grid danh sách game */}
                            {games.length === 0 ? (
                                <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-zinc-600 rounded-2xl bg-slate-50/50 dark:bg-zinc-800/50 p-6">
                                    <div className="text-4xl mb-3">🎮</div>
                                    <h4 className="text-sm font-bold text-slate-700 dark:text-zinc-300">Chưa có game nào trong danh sách</h4>
                                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                                        Vui lòng nhấn nút <strong className="text-red-500">➕ Create New Game</strong> ở góc trên bên phải để bắt đầu thiết lập cấu hình.
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    {games.map((game) => (
                                        <div
                                            key={game.id}
                                            onClick={() => setSelectedGameId(game.id)}
                                            className="group relative bg-[#2b3140] border border-white/5 rounded-2xl shadow-[0_10px_24px_rgba(10,12,18,0.18)] min-h-[160px] overflow-hidden transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:bg-[#353c4d] hover:shadow-[0_14px_28px_rgba(10,12,18,0.22)] flex flex-col justify-between p-5">
                                            <div>
                                                <div className="flex justify-between items-start">
                                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-500 to-amber-500 text-white flex items-center justify-center font-bold font-mono text-sm shadow-md shadow-red-500/10">
                                                        {game.name.substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleDeleteGame(game.id, e)}
                                                        className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-all cursor-pointer"
                                                        title="Xóa game">
                                                        🗑️
                                                    </button>
                                                </div>
                                                <div className="mt-4">
                                                    <h3 className="text-base font-bold text-zinc-100 group-hover:text-red-300 transition-colors">
                                                        {game.id} - {game.name}
                                                    </h3>
                                                    <p className="text-xs text-zinc-400 mt-0.5">
                                                        {game.panels.length} Matrix Panels cấu hình
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="mt-4 text-xs font-semibold text-red-400 flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
                                                Configure Matrix <span>➔</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* MÀN HÌNH 2: CẤU HÌNH CHI TIẾT GAME ĐÃ CHỌN */
                        activeGame && (
                            <div className="space-y-6">
                                {/* Action buttons bar */}
                                <div className="px-6 pt-2 flex justify-start items-center gap-4">
                                    <button
                                        type="button"
                                        onClick={handleClearAll}
                                        className="px-4 py-2.5 bg-[#7d6df7] hover:bg-[#9387ff] text-white font-bold text-xs rounded-xl transition-all shadow-sm shadow-[#7d6df7]/25 flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98]"
                                        title="Xóa toàn bộ cấu hình form và đặt lại danh sách panel">
                                        <span>🔄</span> Reset Form Data
                                    </button>
                                </div>

                                {/* Panel Thông số chung */}
                                <div className="overflow-hidden rounded-2xl border border-white/5">
                                    <button
                                        type="button"
                                        className="flex w-full items-center justify-between bg-white/5 px-5 py-3 border-b border-white/5 text-left cursor-pointer select-none focus:outline-none"
                                        onClick={() => setIsCommonDataOpen((prev) => !prev)}>
                                        <div className="flex items-center gap-2.5">
                                            <span className={`text-[9px] text-slate-400 transition-transform duration-200 ${isCommonDataOpen ? "rotate-90" : ""}`}>
                                                ▶
                                            </span>
                                            <span className="text-sm">⚙️</span>
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-100 font-mono">
                                                Common Data
                                            </h3>
                                        </div>
                                    </button>

                                    {isCommonDataOpen && (
                                        <div className="p-6 space-y-4">
                                            <div className="flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsFieldConfigOpen(prev => !prev)}
                                                    className={`px-2.5 py-1 text-[10px] rounded-lg border font-semibold transition-all ${
                                                        isFieldConfigOpen
                                                            ? "bg-[#7d6df7]/12 border-[#7d6df7]/40 text-[#c2b7ff]"
                                                            : "bg-white dark:bg-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-600 border-slate-300 dark:border-zinc-500 text-slate-700 dark:text-zinc-200"
                                                    } cursor-pointer`}>
                                                    {isFieldConfigOpen ? "✕ Close Config" : "⚡ Configure Fields"}
                                                </button>
                                            </div>

                                            {isFieldConfigOpen && (
                                                <div className="bg-white dark:bg-zinc-900 border border-[#7d6df7]/20 rounded-xl p-4 space-y-2">
                                                    <p className="text-[10px] text-slate-500 dark:text-zinc-400 mb-2">
                                                        Chọn field hiển thị và đổi label cho Additional Data của game này.
                                                    </p>
                                                    {getResolvedFieldConfig(activeGame.fieldConfig).map((field, idx) => (
                                                        <div key={field.key} className="flex items-center gap-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={field.visible}
                                                                onChange={(e) => {
                                                                    const config = [...getResolvedFieldConfig(activeGame.fieldConfig)];
                                                                    config[idx] = { ...config[idx], visible: e.target.checked };
                                                                    setGames(prev => prev.map(g => g.id === selectedGameId ? { ...g, fieldConfig: config } : g));
                                                                }}
                                                                className="w-3.5 h-3.5 rounded border-slate-300 text-[#7d6df7] focus:ring-[#7d6df7] cursor-pointer"
                                                            />
                                                            <input
                                                                type="text"
                                                                value={field.label}
                                                                onChange={(e) => {
                                                                    const config = [...getResolvedFieldConfig(activeGame.fieldConfig)];
                                                                    config[idx] = { ...config[idx], label: e.target.value };
                                                                    setGames(prev => prev.map(g => g.id === selectedGameId ? { ...g, fieldConfig: config } : g));
                                                                }}
                                                                className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-600 rounded-lg text-slate-700 dark:text-zinc-200 focus:outline-none focus:border-[#7d6df7]"
                                                            />
                                                            <span className="text-[9px] text-slate-400 dark:text-zinc-500 font-mono w-32 truncate" title={field.key as string}>
                                                                {field.key as string}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Field: Game ID */}
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 items-center">
                                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                                            Game ID
                                        </label>
                                        <div className="sm:col-span-2">
                                            <input
                                                type="text"
                                                value={activeGame.id}
                                                onChange={(e) => {
                                                    const newId = e.target.value;
                                                    setGames(prev => prev.map(g => g.id === selectedGameId ? { ...g, id: newId } : g));
                                                    setSelectedGameId(newId);
                                                }}
                                                className="w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-600 rounded-xl text-slate-800 dark:text-zinc-200 font-mono text-sm font-bold focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25"
                                            />
                                        </div>
                                    </div>

                                            {/* Field: Game Name */}
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 items-center">
                                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                                            Game Name
                                        </label>
                                        <div className="sm:col-span-2">
                                            <input
                                                type="text"
                                                value={activeGame.name}
                                                onChange={(e) => setGames(prev => prev.map(g => g.id === selectedGameId ? { ...g, name: e.target.value } : g))}
                                                className="w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-600 rounded-xl text-slate-800 dark:text-zinc-200 text-sm font-semibold focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25"
                                            />
                                        </div>
                                    </div>

                                            {/* Field 1: User Id */}
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 items-center">
                                        <label
                                            htmlFor="userId"
                                            className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
                                            User ID <span className="text-red-500">*</span>
                                        </label>
                                        <div className="sm:col-span-2">
                                            <input
                                                type="text"
                                                id="userId"
                                                required
                                                value={activeGame.userId}
                                                onChange={(e) => updateActiveGameUserId(e.target.value)}
                                                placeholder="User ID"
                                                className="w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-600 rounded-xl text-slate-800 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25"
                                            />
                                        </div>
                                    </div>

                                            {/* Field: Server */}
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 items-center">
                                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
                                            Server
                                        </label>
                                        <div className="sm:col-span-2">
                                            <select
                                                value={activeGame.env}
                                                onChange={(e) => setGames(prev => prev.map(g => g.id === selectedGameId ? { ...g, env: e.target.value as "staging" | "dev" } : g))}
                                                className="w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-600 rounded-xl text-slate-800 dark:text-zinc-200 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25 cursor-pointer">
                                                <option value="staging">Staging</option>
                                                <option value="dev">Dev</option>
                                            </select>
                                        </div>
                                    </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 items-start">
                                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400 pt-1">
                                            Local WS
                                        </label>
                                        <div className="sm:col-span-2 space-y-3">
                                            <label className="flex items-center gap-3 cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={localSocketEnabled}
                                                    onChange={(e) => setLocalSocketEnabled(e.target.checked)}
                                                    className="rounded border-slate-300 dark:border-zinc-600 text-red-600 focus:ring-red-500 cursor-pointer"
                                                />
                                                <span className="text-sm font-semibold text-slate-700 dark:text-zinc-200">
                                                    Enable Electron Local WebSocket Server
                                                </span>
                                            </label>

                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                                    localSocketStatus.running
                                                        ? localSocketStatus.clientCount > 0
                                                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                                                            : "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                                                        : "bg-slate-200 text-slate-700 dark:bg-zinc-700 dark:text-zinc-300"
                                                }`}>
                                                    {localSocketStatus.running
                                                        ? localSocketStatus.clientCount > 0
                                                            ? "Client Connected"
                                                            : "Listening"
                                                        : "Off"}
                                                </span>
                                                <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                                                    ws://{localSocketStatus.host}:{localSocketStatus.port}
                                                </span>
                                                {localSocketStatus.lastEventType && (
                                                    <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                                                        Last event: {localSocketStatus.lastEventType}
                                                    </span>
                                                )}
                                                {latestSocketEventRef.current?.payload?.eventId && (
                                                    <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                                                        Event ID: {latestSocketEventRef.current.payload.eventId}
                                                    </span>
                                                )}
                                            </div>

                                            {localSocketStatus.running && (
                                                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-400">
                                                    <span>Use</span>
                                                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-[#7d6df7]/25 bg-[#7d6df7]/10 text-[#b7a8ff]">
                                                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                                                            />
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        </svg>
                                                    </span>
                                                    <span>to download and install the browser extension.</span>
                                                </div>
                                            )}

                                            {localSocketStatus.lastError && (
                                                <div className="text-[11px] font-mono text-red-500 dark:text-red-400">
                                                    {localSocketStatus.lastError}
                                                </div>
                                            )}
                                        </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {localSocketEnabled && (
                                    <div className="overflow-hidden rounded-2xl border border-white/5">
                                        <button
                                            type="button"
                                            className="flex w-full items-center justify-between bg-white/5 px-5 py-3 border-b border-white/5 text-left cursor-pointer select-none focus:outline-none"
                                            onClick={() => setIsAutoplaySequenceExpanded((prev) => !prev)}>
                                            <div className="flex items-center gap-2.5">
                                                <span className={`text-[9px] text-slate-400 transition-transform duration-200 ${isAutoplaySequenceExpanded ? "rotate-90" : ""}`}>
                                                    ▶
                                                </span>
                                                <span className="text-sm">🔁</span>
                                                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-100 font-mono">
                                                    Autoplay Matrix Sequence
                                                </h3>
                                            </div>
                                        </button>

                                        {isAutoplaySequenceExpanded && (
                                            <div className="p-6 space-y-4">
                                                <div className="text-xs text-slate-400 dark:text-zinc-500 pb-1">
                                                    💡 Autoplay chỉ hoạt động khi Local WebSocket Server đang bật. Mỗi bước tiếp theo sẽ chờ socket event thật thay vì dùng delay.
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 items-start">
                                                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400 pt-1">
                                                        Chọn các bước
                                                    </label>
                                                    <div className="sm:col-span-2 space-y-2">
                                                        <div className="flex gap-2 mb-2">
                                                            <button
                                                                type="button"
                                                                disabled={isAutoplayRunning}
                                                                onClick={() => setAutoplaySelectedIds(activeGame.panels.map((p) => p.id))}
                                                                className="px-2.5 py-1 text-[10px] bg-slate-200 dark:bg-zinc-700 hover:bg-slate-300 dark:hover:bg-zinc-600 rounded-lg text-slate-700 dark:text-zinc-300 transition-all font-semibold cursor-pointer">
                                                                Chọn tất cả
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={isAutoplayRunning}
                                                                onClick={() => setAutoplaySelectedIds([])}
                                                                className="px-2.5 py-1 text-[10px] bg-slate-200 dark:bg-zinc-700 hover:bg-slate-300 dark:hover:bg-zinc-600 rounded-lg text-slate-700 dark:text-zinc-300 transition-all font-semibold cursor-pointer">
                                                                Bỏ chọn tất cả
                                                            </button>
                                                        </div>
                                                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                                            {activeGame.panels.map((panel) => {
                                                                const isChecked = autoplaySelectedIds.includes(panel.id);
                                                                const displayName = panel.title.trim() ? panel.title : `Matrix #${panel.id}`;
                                                                return (
                                                                    <div
                                                                        key={panel.id}
                                                                        className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border text-sm transition-all ${
                                                                            isChecked
                                                                                ? "bg-red-50/20 dark:bg-red-950/10 border-red-200 dark:border-red-800/60"
                                                                                : "bg-white dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-700/50"
                                                                        }`}>
                                                                        <label className={`flex items-center gap-3 flex-1 cursor-pointer select-none ${isAutoplayRunning ? "opacity-60 cursor-not-allowed" : ""}`}>
                                                                            <input
                                                                                type="checkbox"
                                                                                disabled={isAutoplayRunning}
                                                                                checked={isChecked}
                                                                                onChange={(e) => {
                                                                                    if (e.target.checked) {
                                                                                        setAutoplaySelectedIds((prev) => [...prev, panel.id]);
                                                                                    } else {
                                                                                        setAutoplaySelectedIds((prev) => prev.filter((id) => id !== panel.id));
                                                                                    }
                                                                                }}
                                                                                className="rounded border-slate-300 dark:border-zinc-600 text-red-600 focus:ring-red-500 cursor-pointer"
                                                                            />
                                                                            <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300 font-mono">
                                                                                {displayName}
                                                                            </span>
                                                                            {autoplayCurrentId === panel.id && (
                                                                                <span className="flex h-2 w-2 relative">
                                                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                                                                </span>
                                                                            )}
                                                                        </label>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="pt-2 flex flex-col gap-4">
                                                    <div className="flex gap-3">
                                                        {!isAutoplayRunning ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    void runAutoplay();
                                                                }}
                                                                disabled={!localSocketStatus.running}
                                                                className={`px-5 py-2.5 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-red-500/10 flex items-center gap-1.5 active:scale-[0.98] ${
                                                                    localSocketStatus.running
                                                                        ? "bg-red-600 hover:bg-red-500 cursor-pointer"
                                                                        : "bg-slate-400 cursor-not-allowed"
                                                                }`}>
                                                                <span>▶</span> Bắt đầu Autoplay
                                                            </button>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={stopAutoplay}
                                                                className="px-5 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer active:scale-[0.98]">
                                                                <span>⏹</span> Dừng Autoplay
                                                            </button>
                                                        )}
                                                    </div>

                                                    <div className="border border-slate-200 dark:border-zinc-700 rounded-xl overflow-hidden shadow-inner">
                                                        <div className="bg-slate-100 dark:bg-zinc-800 px-4 py-2 border-b border-slate-200 dark:border-zinc-700 flex justify-between items-center">
                                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 font-mono">
                                                                Autoplay Console Logs
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => setAutoplayLogs([])}
                                                                className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 font-semibold cursor-pointer">
                                                                Clear Logs
                                                            </button>
                                                        </div>
                                                        <div className="bg-zinc-950 p-4 text-xs font-mono text-emerald-400 h-40 overflow-y-auto space-y-1.5 scrollbar-thin">
                                                            {autoplayLogs.length > 0 ? autoplayLogs.map((log, idx) => (
                                                                <div key={idx} className={log.startsWith("❌") ? "text-red-400" : log.startsWith("✅") ? "text-emerald-400" : log.includes("⏳") ? "text-amber-400/90" : "text-zinc-400"}>
                                                                    {log}
                                                                </div>
                                                            )) : (
                                                                <div className="text-zinc-500">
                                                                    Waiting for autoplay activity...
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Danh sách các panel Form Data */}
                                <div className="px-6 space-y-5">
                                    {activeGame.panels.map((panel) => (
                                        <div
                                            key={panel.id}
                                            className="bg-[#2b3140] border border-white/5 rounded-2xl shadow-[0_18px_36px_rgba(10,12,18,0.24)] overflow-hidden transition-all duration-200">
                                            {/* Tiêu đề Panel */}
                                            <div className="flex items-center justify-between bg-white/5 px-5 py-3 border-b border-white/5">
                                                <button
                                                    type="button"
                                                    className="flex items-center gap-2.5 cursor-pointer select-none text-left focus:outline-none"
                                                    onClick={() => toggleExpand(panel.id)}>
                                                    <span className={`text-[9px] text-slate-400 transition-transform duration-200 ${panel.isExpanded ? "rotate-90" : ""}`}>
                                                        ▶
                                                    </span>
                                                    <span className="text-sm">📝</span>
                                                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-100 font-mono">
                                                        {panel.title.trim() ? panel.title : `Matrix #${panel.id}`}
                                                    </h3>
                                                </button>
                                                <div className="flex items-center gap-2">
                                                    {!panel.isExpanded && (
                                                    <button
                                                        type="button"
                                                        disabled={executingPanelId !== null}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            executePanel(panel);
                                                        }}
                                                        className="px-2.5 py-1 text-xs bg-[#7d6df7] hover:bg-[#9387ff] text-white rounded-lg transition-all cursor-pointer font-semibold flex items-center gap-0.5 shadow-sm shadow-[#7d6df7]/20"
                                                        title="Run this configuration immediately">
                                                        {executingPanelId === panel.id ? "⏳ Executing" : "⚡ Execute"}
                                                    </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            removePanel(panel.id);
                                                        }}
                                                        className="px-2.5 py-1 text-xs text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-300 rounded-lg transition-all cursor-pointer font-medium"
                                                        title="Xóa panel này">
                                                        🗑️ Delete
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Nội dung Panel */}
                                            {panel.isExpanded && (
                                                <div className="p-6 space-y-4">
                                                    {/* Field: Title */}
                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 items-center">
                                                        <label
                                                            htmlFor={`title-${panel.id}`}
                                                            className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                                                            Title
                                                        </label>
                                                        <div className="sm:col-span-2">
                                                            <input
                                                                type="text"
                                                                id={`title-${panel.id}`}
                                                                value={panel.title}
                                                                onChange={(e) => updatePanelField(panel.id, "title", e.target.value)}
                                                                placeholder="e.g., Free Spins, Jackpot Cheat..."
                                                                className="w-full px-4 py-3 bg-[#1b2029] border border-white/5 rounded-xl text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25 font-medium"
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Field 3: Matrix */}
                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 items-center">
                                                        <label
                                                            htmlFor={`matrixData-${panel.id}`}
                                                            className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                                                            Matrix <span className="text-red-500">*</span>
                                                        </label>
                                                        <div className="sm:col-span-2">
                                                            <input
                                                                type="text"
                                                                id={`matrixData-${panel.id}`}
                                                                required
                                                                value={panel.matrixData}
                                                                onChange={(e) => updatePanelField(panel.id, "matrixData", e.target.value)}
                                                                placeholder="Matrix Data"
                                                                className="w-full px-4 py-3 bg-[#1b2029] border border-white/5 rounded-xl text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25"
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Field 4: Table Format */}
                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 items-center">
                                                        <label
                                                            htmlFor={`tableFormat-${panel.id}`}
                                                            className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                                                            Table Format <span className="text-red-500">*</span>
                                                        </label>
                                                        <div className="sm:col-span-2">
                                                            <input
                                                                type="text"
                                                                id={`tableFormat-${panel.id}`}
                                                                required
                                                                value={panel.tableFormat}
                                                                onChange={(e) => updatePanelField(panel.id, "tableFormat", e.target.value)}
                                                                placeholder="Table Format"
                                                                className="w-full px-4 py-3 bg-[#1b2029] border border-white/5 rounded-xl text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25"
                                                            />
                                                        </div>
                                                    </div>

                                                    {(() => {
                                                        const preview = buildMatrixPreview(panel.matrixData, panel.tableFormat);
                                                        return (
                                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 items-start">
                                                                <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400 pt-2">
                                                                    Matrix Preview
                                                                </label>
                                                                <div className="sm:col-span-2">
                                                                    <div className="rounded-xl border border-white/5 bg-[#1b2029] p-3 overflow-x-auto">
                                                                        {!preview.isFormatValid ? (
                                                                            <div className="text-xs text-slate-400 dark:text-zinc-500 font-mono">
                                                                                Invalid table format
                                                                            </div>
                                                                        ) : preview.total === 0 ? (
                                                                            <div className="text-xs text-slate-400 dark:text-zinc-500 font-mono">
                                                                                Empty matrix
                                                                            </div>
                                                                        ) : (
                                                                            <div className="inline-flex items-start gap-2 min-w-full">
                                                                                {preview.columns.map((column, columnIndex) => (
                                                                                    <div key={`${panel.id}-preview-col-${columnIndex}`} className="flex flex-col gap-1 min-w-14">
                                                                                        {column.map(({ value, tokenIndex }, rowIndex) => {
                                                                                            const cellId = `${panel.id}-${tokenIndex}`;
                                                                                            const isAnimated = animatedMatrixCell === cellId;
                                                                                            return (
                                                                                                <input
                                                                                                    key={`${panel.id}-preview-cell-${columnIndex}-${rowIndex}`}
                                                                                                    type="text"
                                                                                                    value={value}
                                                                                                    placeholder="—"
                                                                                                    onChange={(e) => updatePanelMatrixToken(panel, tokenIndex, e.target.value)}
                                                                                                    className={`h-9 w-full px-2 rounded-lg border text-center text-xs font-mono font-semibold transition-all duration-200 focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25 hover:scale-[1.03] hover:bg-[#7d6df7]/10 hover:border-[#7d6df7]/45 hover:shadow-sm hover:shadow-[#7d6df7]/20 ${
                                                                                                        value
                                                                                                            ? "bg-white dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200"
                                                                                                            : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/50 text-red-400 dark:text-red-500 placeholder-red-300 dark:placeholder-red-600"
                                                                                                    } ${
                                                                                                        isAnimated
                                                                                                            ? "animate-pulse scale-[1.04] ring-2 ring-[#a894ff] border-[#8d7ef7]"
                                                                                                            : ""
                                                                                                    }`}
                                                                                                />
                                                                                            );
                                                                                        })}
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    {preview.isFormatValid && preview.total > 0 && preview.total !== preview.expected && (
                                                                        <div className="mt-2 text-[11px] font-mono text-amber-600 dark:text-amber-400">
                                                                            Matrix has {preview.total} items, table format expects {preview.expected}
                                                                            {preview.extra.length > 0 ? `, extra: ${preview.extra.join(", ")}` : ""}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}

                                                    {/* Additional Data (optional) — collapsible, mặc định đóng */}
                                                    <div className="border border-white/5 rounded-xl overflow-hidden">
                                                        <button
                                                            type="button"
                                                            className="flex w-full items-center justify-between bg-white/5 px-5 py-3 border-b border-white/5 text-left cursor-pointer select-none focus:outline-none hover:bg-white/10 transition-colors"
                                                            onClick={() => toggleAdditionalExpand(panel.id)}>
                                                            <div className="flex items-center gap-2.5">
                                                                <span className={`text-[9px] text-slate-400 transition-transform duration-200 ${panel.isAdditionalExpanded ? "rotate-90" : ""}`}>
                                                                    ▶
                                                                </span>
                                                                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-100">
                                                                    Additional Data
                                                                </span>
                                                            </div>
                                                            <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-normal lowercase tracking-normal">
                                                                (optional)
                                                            </span>
                                                        </button>

                                                        {panel.isAdditionalExpanded && (
                                                            <div className="p-4 space-y-4 border-t border-white/5">
                                                                {getResolvedFieldConfig(activeGame.fieldConfig).filter(f => f.visible).map(({ key, label }) => (
                                                                    <div key={key} className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 items-center">
                                                                        <label
                                                                            htmlFor={`${key}-${panel.id}`}
                                                                            className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                                                                            {label}
                                                                        </label>
                                                                        <div className="sm:col-span-2">
                                                                            <input
                                                                                type="text"
                                                                                id={`${key}-${panel.id}`}
                                                                                value={(panel[key] as string) ?? ""}
                                                                                onChange={(e) => updatePanelField(panel.id, key, e.target.value)}
                                                                                placeholder={label}
                                                                                className="w-full px-4 py-3 bg-[#1b2029] border border-white/5 rounded-xl text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Nút gửi dữ liệu của từng panel */}
                                                    <div className="pt-3 border-t border-white/5 flex justify-end">
                                                        <button
                                                            type="button"
                                                            disabled={executingPanelId !== null}
                                                            onClick={() => executePanel(panel)}
                                                            className={`px-5 py-2.5 bg-[#7d6df7] text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-[#7d6df7]/25 flex items-center justify-center gap-2 ${
                                                                executingPanelId !== null
                                                                    ? "opacity-50 cursor-not-allowed"
                                                                    : "hover:bg-[#9387ff] active:scale-[0.99] cursor-pointer"
                                                            }`}>
                                                            {executingPanelId === panel.id ? (
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
                                                                    <span>Executing...</span>
                                                                </>
                                                            ) : (
                                                                `⚡ Execute ${panel.title.trim() ? panel.title : `Matrix #${panel.id}`}`
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Nút thêm panel */}
                                <div className="px-6 pt-4 mt-2 border-t border-white/5">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                        <button
                                            type="button"
                                            onClick={addPanel}
                                            className="px-4 py-2.5 border border-dashed border-slate-300 dark:border-zinc-600 hover:border-red-500 text-slate-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 font-semibold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer bg-slate-50/50 dark:bg-zinc-800/50 hover:bg-red-50/30 dark:hover:bg-red-900/30">
                                            <span>➕</span> Add Matrix
                                        </button>

                                        <button
                                            type="button"
                                            disabled={clearingSession}
                                            onClick={handleClearSession}
                                            className={`px-4 py-2.5 bg-rose-50 hover:bg-rose-100/80 border border-rose-200 text-rose-700 font-bold text-xs rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 ${
                                                clearingSession ? "opacity-50 cursor-not-allowed" : "cursor-pointer active:scale-[0.98]"
                                            }`}
                                            title="Clear session của game hiện tại ngay tại cuối trang cấu hình">
                                            {clearingSession ? (
                                                <>
                                                    <svg
                                                        className="animate-spin h-3.5 w-3.5 text-rose-700"
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
                                                    <span>Clearing Session...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span>🧹</span> Clear Session
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )
                    )}
                </div>
            </div>
        </div>
    );
}
