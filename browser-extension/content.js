(function () {
    const BRIDGE_EVENT_TYPE = "COCOSTOOLS_SOCKET_EVENT";
    const HANDSHAKE_EVENT_TYPE = "extension-handshake";
    const CONTENT_BOOTSTRAP_MARKER = "__COCOSTOOLS_BRIDGE_BOOTSTRAPPED__";
    const PAGE_HOOK_MARKER = "data-cocostools-bridge";
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

    function sendToElectron(payload) {
        chrome.runtime.sendMessage(payload, () => {
            const runtimeError = chrome.runtime.lastError;
            if (runtimeError) {
                console.warn("[CocosTools Bridge] sendMessage failed:", runtimeError.message);
            }
        });
    }

    function injectPageHook() {
        const existingHook = document.querySelector(`script[${PAGE_HOOK_MARKER}="true"]`);
        if (existingHook) {
            existingHook.dataset.allowedOrigins = JSON.stringify(getAllowedOrigins());
            return;
        }

        const script = document.createElement("script");
        script.src = chrome.runtime.getURL("page-hook.js");
        script.async = false;
        script.dataset.cocostoolsBridge = "true";
        script.dataset.allowedOrigins = JSON.stringify(getAllowedOrigins());
        (document.documentElement || document.head || document.body).appendChild(script);
        script.remove();
    }

    function getAllowedOrigins() {
        const customOrigins = Array.isArray(window.__COCOSTOOLS_ALLOWED_ORIGINS__)
            ? window.__COCOSTOOLS_ALLOWED_ORIGINS__
            : [];
        return [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...customOrigins])];
    }

    function bootstrap() {
        const allowedOrigins = getAllowedOrigins();
        if (!allowedOrigins.includes(window.location.origin)) {
            window[CONTENT_BOOTSTRAP_MARKER] = false;
            return;
        }

        injectPageHook();
        window[CONTENT_BOOTSTRAP_MARKER] = true;
        sendToElectron({
            type: HANDSHAKE_EVENT_TYPE,
            extensionVersion: chrome.runtime.getManifest().version,
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

                window.__COCOSTOOLS_ALLOWED_ORIGINS__ = Array.isArray(result.customAllowedOrigins)
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

    chrome.storage.local.get("customAllowedOrigins", (result) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
            console.warn("[CocosTools Bridge] load origins failed:", runtimeError.message);
            window.__COCOSTOOLS_ALLOWED_ORIGINS__ = [];
            bootstrap();
            return;
        }

        window.__COCOSTOOLS_ALLOWED_ORIGINS__ = Array.isArray(result.customAllowedOrigins)
            ? result.customAllowedOrigins
            : [];
        bootstrap();
    });
})();
