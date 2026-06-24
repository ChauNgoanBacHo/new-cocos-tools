const LOCAL_WS_URL = "ws://127.0.0.1:17381";
const HEARTBEAT_INTERVAL_MS = 15000;
const STORAGE_KEY = "localSocketEnabled";
const CUSTOM_ORIGINS_KEY = "customAllowedOrigins";
const AUTOPLAY_GAME_ID_KEY = "autoplayGameId";
const CHEAT_SPEED_KEY = "cheatSpeed";
const SHOW_DEBUG_KEY = "showDebugControls";
const DEBUG_EXCLUDE_LIST_KEY = "debugExcludeList";
const DEBUG_HIGHLIGHT_LIST_KEY = "debugHighlightList";
const DEBUG_HIGHLIGHT_COLOR_KEY = "debugHighlightColor";
const DEFAULT_DEBUG_EXCLUDE_LIST = [
    "SocketManager",
    "CommandManager",
    "ping[]",
    "pong - latency",
    "SocketManagerNewMessage",
    "[PHYSICS]",
    "[PHYSICS2D",
    "native sound init",
    "my wallet update",
    "MessageManager - sendMessage: %s - %j[\"wallet-service-id\"",
    "EventManager - newEvent: %j[{\"event\":\"wallet-updated\"",
    "[SoundPlayerImpl]",
    "SockerManager - health-check",
    "MessageManager\\x20-\\x20_handleSocketEvent.",
    "MessageManager - _initSocket",
    "MessageManager - _handleSocketStatus.",
    "MessageManager - closeAndCleanUp.",
    "MessageManager - _handleSocketStatus."
];

let socket = null;
let reconnectTimeout = null;
let heartbeatInterval = null;
let lastHandshakePayload = null;
let localSocketEnabled = true;
let hasActiveBridgeContext = false;
let lastConnectionError = null;
let pendingMessages = [];

function clearReconnectTimeout() {
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

function closeSocket() {
    clearReconnectTimeout();
    stopHeartbeat();

    if (socket) {
        try {
            if (socket.readyState === WebSocket.OPEN) {
                socket.close();
            }
        } catch {
            // ignore close failures
        }
    }

    socket = null;
}

function connectToLocalSocket() {
    if (!localSocketEnabled || !hasActiveBridgeContext) {
        closeSocket();
        return;
    }

    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        return;
    }

    try {
        socket = new WebSocket(LOCAL_WS_URL);

        socket.addEventListener("open", () => {
            lastConnectionError = null;
            if (lastHandshakePayload) {
                sendToElectron(lastHandshakePayload);
            }
            flushPendingMessages();

            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
            }

            heartbeatInterval = setInterval(() => {
                sendToElectron({
                    type: "extension-heartbeat",
                    timestamp: Date.now(),
                });
            }, HEARTBEAT_INTERVAL_MS);
        });

        socket.addEventListener("close", () => {
            stopHeartbeat();
            socket = null;

            if (localSocketEnabled && hasActiveBridgeContext) {
                clearReconnectTimeout();
                reconnectTimeout = setTimeout(connectToLocalSocket, 2000);
            }
        });

        socket.addEventListener("error", () => {
            lastConnectionError = "Electron local server is unreachable.";
            clearReconnectTimeout();
        });
    } catch {
        lastConnectionError = "Could not start a bridge connection attempt.";
        clearReconnectTimeout();
        reconnectTimeout = setTimeout(connectToLocalSocket, 3000);
    }
}

function sendToElectron(payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        pendingMessages.push(payload);
        return false;
    }
    socket.send(JSON.stringify(payload));
    return true;
}

function flushPendingMessages() {
    if (!socket || socket.readyState !== WebSocket.OPEN || pendingMessages.length === 0) {
        return;
    }

    const queuedMessages = pendingMessages;
    pendingMessages = [];

    for (const message of queuedMessages) {
        socket.send(JSON.stringify(message));
    }
}

function isSupportedBridgeUrl(url) {
    if (typeof url !== "string" || !url) {
        return false;
    }

    try {
        const parsedUrl = new URL(url);
        return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
    } catch {
        return false;
    }
}

async function sendPageControlToTabs(command, payload, options = {}) {
    const {
        activeOnly = true,
        tabIds = null,
    } = options;
    let tabs = [];

    try {
        if (Array.isArray(tabIds) && tabIds.length > 0) {
            tabs = (
                await Promise.all(
                    tabIds.map(async (tabId) => {
                        try {
                            return await chrome.tabs.get(tabId);
                        } catch {
                            return null;
                        }
                    }),
                )
            ).filter(Boolean);
        } else {
            tabs = activeOnly
                ? await chrome.tabs.query({ active: true, lastFocusedWindow: true })
                : await chrome.tabs.query({});
        }
    } catch {
        return { sentCount: 0 };
    }

    let sentCount = 0;

    await Promise.all(
        tabs
            .filter((tab) => typeof tab.id === "number" && isSupportedBridgeUrl(tab.url))
            .map(async (tab) => {
                try {
                    const response = await chrome.tabs.sendMessage(tab.id, {
                        type: "apply-page-control",
                        command,
                        payload,
                    });

                    if (response?.ok) {
                        sentCount += 1;
                    }
                } catch {
                    // Ignore tabs without an active content script bridge.
                }
            }),
    );

    return { sentCount };
}

async function syncControlSettingsToTabs(options = {}) {
    const result = await chrome.storage.local.get([
        CHEAT_SPEED_KEY,
        SHOW_DEBUG_KEY,
        DEBUG_EXCLUDE_LIST_KEY,
        DEBUG_HIGHLIGHT_LIST_KEY,
        DEBUG_HIGHLIGHT_COLOR_KEY,
    ]);
    const cheatSpeed = typeof result[CHEAT_SPEED_KEY] === "number" ? result[CHEAT_SPEED_KEY] : 1;
    const showDebugControls = result[SHOW_DEBUG_KEY] === true;
    const debugExcludeList = Array.isArray(result[DEBUG_EXCLUDE_LIST_KEY]) ? result[DEBUG_EXCLUDE_LIST_KEY] : DEFAULT_DEBUG_EXCLUDE_LIST;
    const debugHighlightList = Array.isArray(result[DEBUG_HIGHLIGHT_LIST_KEY]) ? result[DEBUG_HIGHLIGHT_LIST_KEY] : [];
    const debugHighlightColor = typeof result[DEBUG_HIGHLIGHT_COLOR_KEY] === "string" ? result[DEBUG_HIGHLIGHT_COLOR_KEY] : "red";

    await sendPageControlToTabs("set-debug-visibility", { enabled: showDebugControls }, options);
    await sendPageControlToTabs("set-speed", { speed: cheatSpeed }, options);
    await sendPageControlToTabs("set-debug-filter-lists", {
        excludeList: debugExcludeList,
        highlightList: debugHighlightList,
        highlightColor: debugHighlightColor,
    }, options);

    return {
        cheatSpeed,
        showDebugControls,
        debugExcludeList,
        debugHighlightList,
        debugHighlightColor,
    };
}

function extractGameIdFromUrl(url) {
    if (typeof url !== "string" || !url) {
        return "";
    }

    try {
        const parsedUrl = new URL(url);
        const pathMatch = parsedUrl.pathname.match(/kts(\d+)/i);
        if (pathMatch) {
            return pathMatch[1];
        }

        const queryGameId = parsedUrl.searchParams.get("gameId") || parsedUrl.searchParams.get("gid") || parsedUrl.searchParams.get("id");
        return typeof queryGameId === "string" ? queryGameId.trim() : "";
    } catch {
        return "";
    }
}

async function resolveAutoplayGameId(savedGameId) {
    if (savedGameId) {
        return savedGameId;
    }

    try {
        const tabs = await chrome.tabs.query({
            active: true,
            lastFocusedWindow: true,
        });

        for (const tab of tabs) {
            const inferredGameId = extractGameIdFromUrl(tab.url);
            if (inferredGameId) {
                return inferredGameId;
            }
        }
    } catch {
        return "";
    }

    return "";
}

async function requestBridgeReconnectForActiveTabs() {
    let tabs = [];

    try {
        tabs = await chrome.tabs.query({});
    } catch {
        return {
            hasBridgeContext: hasActiveBridgeContext,
        };
    }

    let bridgedCount = 0;

    await Promise.all(
        tabs
            .filter((tab) => typeof tab.id === "number" && isSupportedBridgeUrl(tab.url))
            .map(async (tab) => {
                try {
                    const response = await chrome.tabs.sendMessage(tab.id, {
                        type: "reconnect-bridge",
                    });

                    if (response?.ok && response.bridged) {
                        bridgedCount += 1;
                        hasActiveBridgeContext = true;
                    }
                } catch {
                    // Ignore tabs without an active content script bridge.
                }
            }),
    );

    if (bridgedCount === 0 && !lastHandshakePayload) {
        hasActiveBridgeContext = false;
    }

    return {
        hasBridgeContext: hasActiveBridgeContext,
        bridgedCount,
    };
}

chrome.runtime.onInstalled.addListener(() => {
    console.log("[One Punch Assistant] Extension installed");
    void resetDebugControlsToDefault();
});

chrome.runtime.onStartup.addListener(() => {
    void initializeLocalSocketState();
    void resetDebugControlsToDefault();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== "object") {
        sendResponse({ ok: false });
        return false;
    }

    if (message.type === "get-local-socket-state") {
        sendResponse({
            ok: true,
            enabled: localSocketEnabled,
            connected: Boolean(socket && socket.readyState === WebSocket.OPEN),
            hasActiveBridgeContext,
            lastConnectionError,
        });
        return false;
    }

    if (message.type === "get-extension-settings") {
        void chrome.storage.local.get([
            CUSTOM_ORIGINS_KEY,
            AUTOPLAY_GAME_ID_KEY,
            CHEAT_SPEED_KEY,
            SHOW_DEBUG_KEY,
            DEBUG_EXCLUDE_LIST_KEY,
            DEBUG_HIGHLIGHT_LIST_KEY,
            DEBUG_HIGHLIGHT_COLOR_KEY,
        ]).then((result) => {
            sendResponse({
                ok: true,
                enabled: localSocketEnabled,
                connected: Boolean(socket && socket.readyState === WebSocket.OPEN),
                hasActiveBridgeContext,
                lastConnectionError,
                customAllowedOrigins: Array.isArray(result[CUSTOM_ORIGINS_KEY]) ? result[CUSTOM_ORIGINS_KEY] : [],
                autoplayGameId: typeof result[AUTOPLAY_GAME_ID_KEY] === "string" ? result[AUTOPLAY_GAME_ID_KEY] : "",
                cheatSpeed: typeof result[CHEAT_SPEED_KEY] === "number" ? result[CHEAT_SPEED_KEY] : 1,
                showDebugControls: result[SHOW_DEBUG_KEY] === true,
                debugExcludeList: Array.isArray(result[DEBUG_EXCLUDE_LIST_KEY]) ? result[DEBUG_EXCLUDE_LIST_KEY] : DEFAULT_DEBUG_EXCLUDE_LIST,
                debugHighlightList: Array.isArray(result[DEBUG_HIGHLIGHT_LIST_KEY]) ? result[DEBUG_HIGHLIGHT_LIST_KEY] : [],
                debugHighlightColor: typeof result[DEBUG_HIGHLIGHT_COLOR_KEY] === "string" ? result[DEBUG_HIGHLIGHT_COLOR_KEY] : "red",
            });
        });
        return true;
    }

    if (message.type === "get-debug-filter-settings") {
        void chrome.storage.local.get([
            DEBUG_EXCLUDE_LIST_KEY,
            DEBUG_HIGHLIGHT_LIST_KEY,
            DEBUG_HIGHLIGHT_COLOR_KEY,
        ]).then((result) => {
            sendResponse({
                ok: true,
                debugExcludeList: Array.isArray(result[DEBUG_EXCLUDE_LIST_KEY]) ? result[DEBUG_EXCLUDE_LIST_KEY] : DEFAULT_DEBUG_EXCLUDE_LIST,
                debugHighlightList: Array.isArray(result[DEBUG_HIGHLIGHT_LIST_KEY]) ? result[DEBUG_HIGHLIGHT_LIST_KEY] : [],
                debugHighlightColor: typeof result[DEBUG_HIGHLIGHT_COLOR_KEY] === "string" ? result[DEBUG_HIGHLIGHT_COLOR_KEY] : "red",
            });
        });
        return true;
    }

    if (message.type === "set-cheat-speed") {
        const nextSpeed = Number.isFinite(Number(message.speed)) ? Math.max(0.1, Number(message.speed)) : 1;
        void chrome.storage.local.set({
            [CHEAT_SPEED_KEY]: nextSpeed,
        }).then(async () => {
            await sendPageControlToTabs("set-speed", { speed: nextSpeed });
            sendResponse({
                ok: true,
                cheatSpeed: nextSpeed,
            });
        });
        return true;
    }

    if (message.type === "set-show-debug-controls") {
        const showDebugControls = message.enabled === true;
        void chrome.storage.local.set({
            [SHOW_DEBUG_KEY]: showDebugControls,
        }).then(async () => {
            await sendPageControlToTabs("set-debug-visibility", { enabled: showDebugControls });
            sendResponse({
                ok: true,
                showDebugControls,
            });
        });
        return true;
    }

    if (message.type === "toggle-game-pause") {
        void sendPageControlToTabs("toggle-pause", {}, { activeOnly: true }).then(({ sentCount }) => {
            sendResponse({
                ok: sentCount > 0,
            });
        });
        return true;
    }

    if (message.type === "step-next-frame") {
        void sendPageControlToTabs("step-next-frame", {}, { activeOnly: true }).then(({ sentCount }) => {
            sendResponse({
                ok: sentCount > 0,
            });
        });
        return true;
    }

    if (message.type === "toggle-speed-boost") {
        void chrome.storage.local.get(CHEAT_SPEED_KEY).then(async (result) => {
            const speed = typeof result[CHEAT_SPEED_KEY] === "number" ? result[CHEAT_SPEED_KEY] : 1;
            const response = await sendPageControlToTabs("toggle-speed-boost", { speed }, { activeOnly: true });
            sendResponse({
                ok: response.sentCount > 0,
                cheatSpeed: speed,
            });
        });
        return true;
    }

    if (message.type === "set-local-socket-state") {
        const enabled = Boolean(message.enabled);
        void setLocalSocketEnabled(enabled).then(async () => {
            if (enabled) {
                await requestBridgeReconnectForActiveTabs();
                await syncControlSettingsToTabs({ activeOnly: false });
                connectToLocalSocket();
            }

            sendResponse({
                ok: true,
                enabled: localSocketEnabled,
                connected: Boolean(socket && socket.readyState === WebSocket.OPEN),
                hasActiveBridgeContext,
                lastConnectionError,
            });
        });
        return true;
    }

    if (message.type === "reconnect-local-socket") {
        void requestBridgeReconnectForActiveTabs().then(async () => {
            await syncControlSettingsToTabs({ activeOnly: false });
            if (localSocketEnabled) {
                closeSocket();
                connectToLocalSocket();
            }

            sendResponse({
                ok: true,
                enabled: localSocketEnabled,
                connected: Boolean(socket && socket.readyState === WebSocket.OPEN),
                hasActiveBridgeContext,
                lastConnectionError,
            });
        });
        return true;
    }

    if (message.type === "set-custom-origins") {
        const nextOrigins = Array.isArray(message.origins)
            ? message.origins.filter((origin) => typeof origin === "string")
            : [];
        void chrome.storage.local.set({
            [CUSTOM_ORIGINS_KEY]: nextOrigins,
        }).then(() => {
            sendResponse({
                ok: true,
                customAllowedOrigins: nextOrigins,
            });
        });
        return true;
    }

    if (message.type === "set-debug-exclude-list") {
        const nextList = Array.isArray(message.values)
            ? message.values.filter((value) => typeof value === "string")
            : [];
        void chrome.storage.local.set({
            [DEBUG_EXCLUDE_LIST_KEY]: nextList,
        }).then(async () => {
            const highlightSettings = await chrome.storage.local.get([
                DEBUG_HIGHLIGHT_LIST_KEY,
                DEBUG_HIGHLIGHT_COLOR_KEY,
            ]);
            await sendPageControlToTabs("set-debug-filter-lists", {
                excludeList: nextList,
                highlightList: highlightSettings[DEBUG_HIGHLIGHT_LIST_KEY] ?? [],
                highlightColor: typeof highlightSettings[DEBUG_HIGHLIGHT_COLOR_KEY] === "string"
                    ? highlightSettings[DEBUG_HIGHLIGHT_COLOR_KEY]
                    : "red",
            }, { activeOnly: false });
            sendResponse({
                ok: true,
                debugExcludeList: nextList,
            });
        });
        return true;
    }

    if (message.type === "set-debug-highlight-list") {
        const nextList = Array.isArray(message.values)
            ? message.values.filter((value) => typeof value === "string")
            : [];
        void chrome.storage.local.set({
            [DEBUG_HIGHLIGHT_LIST_KEY]: nextList,
        }).then(async () => {
            const filterSettings = await chrome.storage.local.get([
                DEBUG_EXCLUDE_LIST_KEY,
                DEBUG_HIGHLIGHT_COLOR_KEY,
            ]);
            await sendPageControlToTabs("set-debug-filter-lists", {
                excludeList: filterSettings[DEBUG_EXCLUDE_LIST_KEY] ?? DEFAULT_DEBUG_EXCLUDE_LIST,
                highlightList: nextList,
                highlightColor: typeof filterSettings[DEBUG_HIGHLIGHT_COLOR_KEY] === "string"
                    ? filterSettings[DEBUG_HIGHLIGHT_COLOR_KEY]
                    : "red",
            }, { activeOnly: false });
            sendResponse({
                ok: true,
                debugHighlightList: nextList,
            });
        });
        return true;
    }

    if (message.type === "set-debug-highlight-color") {
        const allowedColors = new Set(["red", "amber", "cyan"]);
        const nextColor = typeof message.color === "string" && allowedColors.has(message.color)
            ? message.color
            : "red";
        void chrome.storage.local.set({
            [DEBUG_HIGHLIGHT_COLOR_KEY]: nextColor,
        }).then(async () => {
            const filterSettings = await chrome.storage.local.get([
                DEBUG_EXCLUDE_LIST_KEY,
                DEBUG_HIGHLIGHT_LIST_KEY,
            ]);
            await sendPageControlToTabs("set-debug-filter-lists", {
                excludeList: filterSettings[DEBUG_EXCLUDE_LIST_KEY] ?? DEFAULT_DEBUG_EXCLUDE_LIST,
                highlightList: filterSettings[DEBUG_HIGHLIGHT_LIST_KEY] ?? [],
                highlightColor: nextColor,
            }, { activeOnly: false });
            sendResponse({
                ok: true,
                debugHighlightColor: nextColor,
            });
        });
        return true;
    }

    if (message.type === "set-autoplay-game-id") {
        const nextGameId = typeof message.gameId === "string" ? message.gameId.trim() : "";
        void chrome.storage.local.set({
            [AUTOPLAY_GAME_ID_KEY]: nextGameId,
        }).then(() => {
            sendResponse({
                ok: true,
                autoplayGameId: nextGameId,
            });
        });
        return true;
    }

    if (message.type === "extension-handshake") {
        lastHandshakePayload = {
            ...message,
            timestamp: Date.now(),
        };
        hasActiveBridgeContext = true;
        const senderTabId = typeof _sender?.tab?.id === "number" ? _sender.tab.id : null;
        void syncControlSettingsToTabs(
            senderTabId
                ? { activeOnly: false, tabIds: [senderTabId] }
                : { activeOnly: true },
        );
        if (localSocketEnabled) {
            connectToLocalSocket();
            sendToElectron(lastHandshakePayload);
        }
        sendResponse({ ok: true });
        return false;
    }

    if (message.type === "start-autoplay-command") {
        hasActiveBridgeContext = true;
        void chrome.storage.local.get(AUTOPLAY_GAME_ID_KEY).then((result) => {
            const savedAutoplayGameId = typeof result[AUTOPLAY_GAME_ID_KEY] === "string"
                ? result[AUTOPLAY_GAME_ID_KEY].trim()
                : "";
            void resolveAutoplayGameId(savedAutoplayGameId).then((autoplayGameId) => {
                if (localSocketEnabled) {
                    connectToLocalSocket();
                    sendToElectron({
                        type: "extension-command",
                        command: "start-autoplay",
                        timestamp: Date.now(),
                        source: "extension-popup",
                        gameId: autoplayGameId || null,
                    });
                }

                sendResponse({
                    ok: true,
                    enabled: localSocketEnabled,
                    connected: Boolean(socket && socket.readyState === WebSocket.OPEN),
                    hasActiveBridgeContext,
                    lastConnectionError,
                    autoplayGameId,
                });
            });
        });
        return true;
    }

    if (localSocketEnabled) {
        hasActiveBridgeContext = true;
        connectToLocalSocket();
        sendToElectron(message);
    }
    sendResponse({ ok: true });
    return false;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[STORAGE_KEY]) {
        return;
    }

    localSocketEnabled = changes[STORAGE_KEY].newValue !== false;
    if (localSocketEnabled) {
        connectToLocalSocket();
        return;
    }

    closeSocket();
});

async function initializeLocalSocketState() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    localSocketEnabled = result[STORAGE_KEY] !== false;
    lastConnectionError = null;
    closeSocket();
}

async function resetDebugControlsToDefault() {
    await chrome.storage.local.set({
        [SHOW_DEBUG_KEY]: false,
    });

    await sendPageControlToTabs("set-debug-visibility", { enabled: false }, { activeOnly: false });
}

async function setLocalSocketEnabled(enabled) {
    localSocketEnabled = enabled;
    lastConnectionError = null;
    await chrome.storage.local.set({
        [STORAGE_KEY]: enabled,
    });

    if (enabled) {
        connectToLocalSocket();
        return;
    }

    hasActiveBridgeContext = false;
    closeSocket();
}

void initializeLocalSocketState();
void resetDebugControlsToDefault();
