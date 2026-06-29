const CUSTOM_ORIGINS_KEY = "customAllowedOrigins";
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
    "wallet-service-id",
    "wallet-updated",
    "SoundPlayerImpl",
    "health-check",
    "x20_handleSocketEvent",
    "_initSocket",
    "_handleSocketStatus",
    "closeAndCleanUp",
    "_handleSocketStatus"
];

function isSupportedUrl(url) {
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
            .filter((tab) => typeof tab.id === "number" && isSupportedUrl(tab.url))
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
                    // Ignore tabs without an active content script.
                }
            }),
    );

    return { sentCount };
}

chrome.runtime.onInstalled.addListener(() => {
    console.log("[Bunny Assistant] Extension installed");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== "object") {
        sendResponse({ ok: false });
        return false;
    }

    if (message.type === "get-extension-settings") {
        void chrome.storage.local.get([
            CUSTOM_ORIGINS_KEY,
            CHEAT_SPEED_KEY,
            SHOW_DEBUG_KEY,
            DEBUG_EXCLUDE_LIST_KEY,
            DEBUG_HIGHLIGHT_LIST_KEY,
            DEBUG_HIGHLIGHT_COLOR_KEY,
        ]).then((result) => {
            sendResponse({
                ok: true,
                customAllowedOrigins: Array.isArray(result[CUSTOM_ORIGINS_KEY]) ? result[CUSTOM_ORIGINS_KEY] : [],
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

    sendResponse({ ok: false });
    return false;
});
