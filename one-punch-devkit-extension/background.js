const CUSTOM_ORIGINS_KEY = "customAllowedOrigins";
const CHEAT_SPEED_KEY = "cheatSpeed";
const SHOW_DEBUG_KEY = "showDebugControls";

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
                    // Ignore tabs without an active content script.
                }
            }),
    );

    return { sentCount };
}

async function syncControlSettingsToTabs(options = {}) {
    const result = await chrome.storage.local.get([CHEAT_SPEED_KEY, SHOW_DEBUG_KEY]);
    const cheatSpeed = typeof result[CHEAT_SPEED_KEY] === "number" ? result[CHEAT_SPEED_KEY] : 1;
    const showDebugControls = result[SHOW_DEBUG_KEY] === true;

    await sendPageControlToTabs("set-debug-visibility", { enabled: showDebugControls }, options);
    await sendPageControlToTabs("set-speed", { speed: cheatSpeed }, options);

    return {
        cheatSpeed,
        showDebugControls,
    };
}

async function getActiveTabDebugState() {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const activeTab = tabs.find((tab) => typeof tab.id === "number" && isSupportedBridgeUrl(tab.url));

    if (!activeTab?.id) {
        return null;
    }

    try {
        const response = await chrome.tabs.sendMessage(activeTab.id, {
            type: "get-page-control-state",
        });

        if (response?.ok && response.state) {
            return response.state;
        }
    } catch {
        return null;
    }

    return null;
}

chrome.runtime.onInstalled.addListener(() => {
    console.log("[One Punch Assistant Lite] Extension installed");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== "object") {
        sendResponse({ ok: false });
        return false;
    }

    if (message.type === "get-extension-settings") {
        void chrome.storage.local.get([CUSTOM_ORIGINS_KEY, CHEAT_SPEED_KEY, SHOW_DEBUG_KEY]).then((result) => {
            void getActiveTabDebugState().then((debugState) => {
                sendResponse({
                ok: true,
                customAllowedOrigins: Array.isArray(result[CUSTOM_ORIGINS_KEY]) ? result[CUSTOM_ORIGINS_KEY] : [],
                cheatSpeed: typeof result[CHEAT_SPEED_KEY] === "number" ? result[CHEAT_SPEED_KEY] : 1,
                showDebugControls: result[SHOW_DEBUG_KEY] === true,
                debugState,
                });
            });
        });
        return true;
    }

    if (message.type === "set-cheat-speed") {
        const nextSpeed = Number.isFinite(Number(message.speed)) ? Math.max(0.1, Number(message.speed)) : 1;
        void chrome.storage.local.set({
            [CHEAT_SPEED_KEY]: nextSpeed,
        }).then(async () => {
            await sendPageControlToTabs("set-speed", { speed: nextSpeed }, { activeOnly: false });
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
            await sendPageControlToTabs("set-debug-visibility", { enabled: showDebugControls }, { activeOnly: false });
            sendResponse({
                ok: true,
                showDebugControls,
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

    if (message.type === "refresh-debug-controls") {
        void syncControlSettingsToTabs({ activeOnly: true }).then(({ cheatSpeed, showDebugControls }) => {
            sendResponse({
                ok: true,
                cheatSpeed,
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

    if (message.type === "reset-speed-boost") {
        void sendPageControlToTabs("reset-speed", {}, { activeOnly: true }).then(({ sentCount }) => {
            sendResponse({
                ok: sentCount > 0,
            });
        });
        return true;
    }

    if (message.type === "page-bridge-ready") {
        const senderTabId = typeof sender?.tab?.id === "number" ? sender.tab.id : null;
        void syncControlSettingsToTabs(
            senderTabId
                ? { activeOnly: false, tabIds: [senderTabId] }
                : { activeOnly: true },
        ).then(() => {
            sendResponse({ ok: true });
        });
        return true;
    }

    sendResponse({ ok: false });
    return false;
});
