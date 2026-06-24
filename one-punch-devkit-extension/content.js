(function () {
    const BRIDGE_EVENT_TYPE = "ONE_PUNCH_TOOLS_SOCKET_EVENT";
    const PAGE_CONTROL_EVENT_TYPE = "ONE_PUNCH_TOOLS_PAGE_CONTROL";
    const HANDSHAKE_EVENT_TYPE = "extension-handshake";
    const CONTENT_BOOTSTRAP_MARKER = "__ONE_PUNCH_TOOLS_BRIDGE_BOOTSTRAPPED__";
    const PAGE_HOOK_MARKER = "data-one-punch-devkit-bridge";
    const LOCAL_SOCKET_STORAGE_KEY = "localSocketEnabled";
    const SHOW_DEBUG_STORAGE_KEY = "showDebugControls";
    let isExtensionContextAlive = true;
    let isLocalSocketEnabled = true;
    let isDebugControlsEnabled = false;
    const DEFAULT_ALLOWED_ORIGINS = [
        "http://localhost:7456",
        "https://iframe-tektale.staging.enostd.gay",
        "https://iframe.staging.enostd.gay",
        "https://webapp1tek.enostd.gay",
        "https://webapp2tek.enostd.gay",
        "https://webapp3tek.enostd.gay",
        "https://webapp4tek.enostd.gay",
        "https://webapp5tek.enostd.gay",
        "https://webapp6tek.enostd.gay",
        "https://webapp7tek.enostd.gay",
        "https://webapp8tek.enostd.gay",
        "https://webapp9tek.enostd.gay",
        "https://webapp10tek.enostd.gay",
        "https://webapp11tek.enostd.gay",
        "https://webapp12tek.enostd.gay",
        "https://webapp13tek.enostd.gay",
        "https://webapp14tek.enostd.gay",
        "https://webapp15tek.enostd.gay",
        "https://webapp16tek.enostd.gay",
        "https://webapp17tek.enostd.gay",
        "https://webapp18tek.enostd.gay",
        "https://webapp19tek.enostd.gay",
        "https://webapp20tek.enostd.gay",
    ];

    function isContextInvalidatedError(error) {
        return error instanceof Error && /Extension context invalidated/i.test(error.message);
    }

    function markExtensionContextDead() {
        isExtensionContextAlive = false;
        window[CONTENT_BOOTSTRAP_MARKER] = false;
    }

    function sendToElectron(payload) {
        if (!isExtensionContextAlive) {
            return;
        }

        try {
            chrome.runtime.sendMessage(payload, () => {
                const runtimeError = chrome.runtime.lastError;
                if (runtimeError) {
                    if (/Extension context invalidated/i.test(runtimeError.message)) {
                        markExtensionContextDead();
                        return;
                    }
                    console.warn("[One Punch Assistant] sendMessage failed:", runtimeError.message);
                }
            });
        } catch (error) {
            if (isContextInvalidatedError(error)) {
                markExtensionContextDead();
                return;
            }

            throw error;
        }
    }

    function injectPageHook() {
        if (!isExtensionContextAlive) {
            return;
        }

        const existingHook = document.querySelector(`script[${PAGE_HOOK_MARKER}="true"]`);
        if (existingHook) {
            existingHook.dataset.allowedOrigins = JSON.stringify(getAllowedOrigins());
            return;
        }

        const script = document.createElement("script");
        try {
            script.src = chrome.runtime.getURL("page-hook.js");
        } catch (error) {
            if (isContextInvalidatedError(error)) {
                markExtensionContextDead();
                return;
            }

            throw error;
        }
        script.async = false;
        script.dataset.onePunchDevKitBridge = "true";
        script.dataset.allowedOrigins = JSON.stringify(getAllowedOrigins());
        (document.documentElement || document.head || document.body).appendChild(script);
        script.remove();
    }

    function removePageHook() {
        const existingHook = document.querySelector(`script[${PAGE_HOOK_MARKER}="true"]`);
        if (existingHook) {
            existingHook.remove();
        }

        window[CONTENT_BOOTSTRAP_MARKER] = false;
        window.postMessage({
            source: PAGE_CONTROL_EVENT_TYPE,
            command: "set-debug-visibility",
            payload: { enabled: false },
        }, "*");
    }

    function getAllowedOrigins() {
        const customOrigins = Array.isArray(window.__ONE_PUNCH_TOOLS_ALLOWED_ORIGINS__)
            ? window.__ONE_PUNCH_TOOLS_ALLOWED_ORIGINS__
            : [];
        return [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...customOrigins])];
    }

    function applyDebugVisibilityWithRetry(enabled) {
        const dispatch = () => {
            window.postMessage({
                source: PAGE_CONTROL_EVENT_TYPE,
                command: "set-debug-visibility",
                payload: { enabled },
            }, "*");
        };

        dispatch();
        window.setTimeout(dispatch, 60);
        window.setTimeout(dispatch, 180);
        window.setTimeout(dispatch, 360);
    }

    function bootstrap() {
        if (!isExtensionContextAlive) {
            return;
        }

        if (!isLocalSocketEnabled && !isDebugControlsEnabled) {
            removePageHook();
            return;
        }

        const allowedOrigins = getAllowedOrigins();
        if (!allowedOrigins.includes(window.location.origin)) {
            window[CONTENT_BOOTSTRAP_MARKER] = false;
            return;
        }

        injectPageHook();
        window[CONTENT_BOOTSTRAP_MARKER] = true;
        if (isDebugControlsEnabled) {
            applyDebugVisibilityWithRetry(true);
        }
        if (!isLocalSocketEnabled) {
            return;
        }

        let extensionVersion = "unknown";
        try {
            extensionVersion = chrome.runtime.getManifest().version;
        } catch (error) {
            if (isContextInvalidatedError(error)) {
                markExtensionContextDead();
                return;
            }

            throw error;
        }
        sendToElectron({
            type: HANDSHAKE_EVENT_TYPE,
            extensionVersion,
            pageUrl: window.location.href,
            origin: window.location.origin,
            timestamp: Date.now(),
        });
    }

    window.addEventListener("message", (event) => {
        if (event.source !== window) {
            return;
        }

        const data = event.data;
        if (!data || data.source !== BRIDGE_EVENT_TYPE) {
            return;
        }

        sendToElectron({
            type: typeof data.debugType === "string" ? "extension-debug" : "game-socket-response",
            debugType: typeof data.debugType === "string" ? data.debugType : undefined,
            eventName: typeof data.eventName === "string" ? data.eventName : "socket-message",
            gameId: typeof data.gameId === "string" ? data.gameId : null,
            pageUrl: window.location.href,
            origin: window.location.origin,
            timestamp: Date.now(),
            payload: data.payload,
        });
    });

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (!message || typeof message !== "object") {
            return false;
        }

        if (message.type === "apply-page-control") {
            window.postMessage({
                source: PAGE_CONTROL_EVENT_TYPE,
                command: message.command,
                payload: message.payload ?? {},
            }, "*");

            sendResponse({
                ok: true,
                bridged: Boolean(window[CONTENT_BOOTSTRAP_MARKER]),
                origin: window.location.origin,
                pageUrl: window.location.href,
            });
            return false;
        }

        if (message.type === "reconnect-bridge") {
            chrome.storage.local.get("customAllowedOrigins", (result) => {
                const runtimeError = chrome.runtime.lastError;
                if (runtimeError) {
                    sendResponse({
                        ok: false,
                        message: runtimeError.message,
                    });
                    return;
                }

                window.__ONE_PUNCH_TOOLS_ALLOWED_ORIGINS__ = Array.isArray(result.customAllowedOrigins)
                    ? result.customAllowedOrigins
                    : [];
                bootstrap();
                sendResponse({
                    ok: true,
                    bridged: Boolean(window[CONTENT_BOOTSTRAP_MARKER]),
                    origin: window.location.origin,
                    pageUrl: window.location.href,
                });
            });
            return true;
        }

        return false;
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") {
            return;
        }

        if (changes[LOCAL_SOCKET_STORAGE_KEY]) {
            isLocalSocketEnabled = changes[LOCAL_SOCKET_STORAGE_KEY].newValue !== false;
        }

        if (changes[SHOW_DEBUG_STORAGE_KEY]) {
            isDebugControlsEnabled = changes[SHOW_DEBUG_STORAGE_KEY].newValue === true;
        }

        if (isLocalSocketEnabled || isDebugControlsEnabled) {
            bootstrap();
            return;
        }

        removePageHook();
    });

    chrome.storage.local.get([LOCAL_SOCKET_STORAGE_KEY, SHOW_DEBUG_STORAGE_KEY, "customAllowedOrigins"], (result) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
            console.warn("[One Punch Assistant] load origins failed:", runtimeError.message);
            isLocalSocketEnabled = true;
            isDebugControlsEnabled = false;
            window.__ONE_PUNCH_TOOLS_ALLOWED_ORIGINS__ = [];
            bootstrap();
            return;
        }

        isLocalSocketEnabled = result[LOCAL_SOCKET_STORAGE_KEY] !== false;
        isDebugControlsEnabled = result[SHOW_DEBUG_STORAGE_KEY] === true;
        window.__ONE_PUNCH_TOOLS_ALLOWED_ORIGINS__ = Array.isArray(result.customAllowedOrigins)
            ? result.customAllowedOrigins
            : [];
        bootstrap();
    });
})();
