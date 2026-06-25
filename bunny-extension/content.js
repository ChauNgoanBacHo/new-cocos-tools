(function () {
    const PAGE_CONTROL_EVENT_TYPE = "BUNNY_TOOLS_PAGE_CONTROL";
    const CONTENT_BOOTSTRAP_MARKER = "__BUNNY_TOOLS_BOOTSTRAPPED__";
    const PAGE_HOOK_MARKER = "data-bunny-bridge";
    const SHOW_DEBUG_STORAGE_KEY = "showDebugControls";
    let isExtensionContextAlive = true;
    let isDebugControlsEnabled = false;
    let debugExcludeList = [];
    let debugHighlightList = [];
    let debugHighlightColor = "red";
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
        script.dataset.bunnyBridge = "true";
        script.dataset.allowedOrigins = JSON.stringify(getAllowedOrigins());
        (document.documentElement || document.head || document.body).appendChild(script);
        script.remove();
    }

    function getAllowedOrigins() {
        const customOrigins = Array.isArray(window.__BUNNY_TOOLS_ALLOWED_ORIGINS__)
            ? window.__BUNNY_TOOLS_ALLOWED_ORIGINS__
            : [];
        return [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...customOrigins])];
    }

    function applyDebugFilterLists() {
        window.postMessage({
            source: PAGE_CONTROL_EVENT_TYPE,
            command: "set-debug-filter-lists",
            payload: {
                excludeList: debugExcludeList,
                highlightList: debugHighlightList,
                highlightColor: debugHighlightColor,
            },
        }, "*");
    }

    function applyDebugFilterSettingsFromStorage() {
        chrome.runtime.sendMessage({ type: "get-debug-filter-settings" }, (filterResponse) => {
            if (chrome.runtime.lastError || !filterResponse?.ok) {
                return;
            }

            debugExcludeList = Array.isArray(filterResponse.debugExcludeList)
                ? filterResponse.debugExcludeList
                : [];
            debugHighlightList = Array.isArray(filterResponse.debugHighlightList)
                ? filterResponse.debugHighlightList
                : [];
            debugHighlightColor = typeof filterResponse.debugHighlightColor === "string"
                ? filterResponse.debugHighlightColor
                : "red";
            applyDebugFilterLists();
        });
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

        const allowedOrigins = getAllowedOrigins();
        if (!allowedOrigins.includes(window.location.origin)) {
            window[CONTENT_BOOTSTRAP_MARKER] = false;
            return;
        }

        injectPageHook();
        window[CONTENT_BOOTSTRAP_MARKER] = true;
        applyDebugFilterLists();
        applyDebugVisibilityWithRetry(isDebugControlsEnabled);
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

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") {
            return;
        }

        if (changes[SHOW_DEBUG_STORAGE_KEY]) {
            isDebugControlsEnabled = changes[SHOW_DEBUG_STORAGE_KEY].newValue === true;
        }

        if (
            changes.debugExcludeList
            || changes.debugHighlightList
            || changes.debugHighlightColor
        ) {
            applyDebugFilterSettingsFromStorage();
        }

        bootstrap();
    });

    chrome.storage.local.get([SHOW_DEBUG_STORAGE_KEY, "customAllowedOrigins"], (result) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
            console.warn("[Bunny Assistant] load origins failed:", runtimeError.message);
            isDebugControlsEnabled = false;
            window.__BUNNY_TOOLS_ALLOWED_ORIGINS__ = [];
            chrome.runtime.sendMessage({ type: "get-debug-filter-settings" }, (filterResponse) => {
                debugExcludeList = Array.isArray(filterResponse?.debugExcludeList) ? filterResponse.debugExcludeList : [];
                debugHighlightList = Array.isArray(filterResponse?.debugHighlightList) ? filterResponse.debugHighlightList : [];
                debugHighlightColor = typeof filterResponse?.debugHighlightColor === "string" ? filterResponse.debugHighlightColor : "red";
                bootstrap();
            });
            return;
        }

        isDebugControlsEnabled = result[SHOW_DEBUG_STORAGE_KEY] === true;
        window.__BUNNY_TOOLS_ALLOWED_ORIGINS__ = Array.isArray(result.customAllowedOrigins)
            ? result.customAllowedOrigins
            : [];
        chrome.runtime.sendMessage({ type: "get-debug-filter-settings" }, (filterResponse) => {
            debugExcludeList = Array.isArray(filterResponse?.debugExcludeList) ? filterResponse.debugExcludeList : [];
            debugHighlightList = Array.isArray(filterResponse?.debugHighlightList) ? filterResponse.debugHighlightList : [];
            debugHighlightColor = typeof filterResponse?.debugHighlightColor === "string" ? filterResponse.debugHighlightColor : "red";
            bootstrap();
        });
    });
})();
