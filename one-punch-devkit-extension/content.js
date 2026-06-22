(function () {
    const PAGE_CONTROL_EVENT_TYPE = "ONE_PUNCH_TOOLS_PAGE_CONTROL";
    const CONTENT_BOOTSTRAP_MARKER = "__ONE_PUNCH_TOOLS_LITE_BOOTSTRAPPED__";
    const PAGE_HOOK_MARKER = "data-one-punch-devkit-bridge";
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

    function injectPageHook() {
        const existingHook = document.querySelector(`script[${PAGE_HOOK_MARKER}="true"]`);
        if (existingHook) {
            existingHook.dataset.allowedOrigins = JSON.stringify(getAllowedOrigins());
            return;
        }

        const script = document.createElement("script");
        script.src = chrome.runtime.getURL("page-hook.js");
        script.async = false;
        script.dataset.onePunchDevKitBridge = "true";
        script.dataset.allowedOrigins = JSON.stringify(getAllowedOrigins());
        (document.documentElement || document.head || document.body).appendChild(script);
        script.remove();
    }

    function getAllowedOrigins() {
        const customOrigins = Array.isArray(window.__ONE_PUNCH_TOOLS_ALLOWED_ORIGINS__)
            ? window.__ONE_PUNCH_TOOLS_ALLOWED_ORIGINS__
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
        chrome.runtime.sendMessage({
            type: "page-bridge-ready",
            pageUrl: window.location.href,
            origin: window.location.origin,
            timestamp: Date.now(),
        }, () => {
            void chrome.runtime.lastError;
        });
    }

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

        return false;
    });

    chrome.storage.local.get("customAllowedOrigins", (result) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
            console.warn("[One Punch Assistant Lite] load origins failed:", runtimeError.message);
            window.__ONE_PUNCH_TOOLS_ALLOWED_ORIGINS__ = [];
            bootstrap();
            return;
        }

        window.__ONE_PUNCH_TOOLS_ALLOWED_ORIGINS__ = Array.isArray(result.customAllowedOrigins)
            ? result.customAllowedOrigins
            : [];
        bootstrap();
    });
})();
