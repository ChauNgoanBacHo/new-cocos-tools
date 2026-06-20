const toggleButton = document.getElementById("toggle-button");
const toggleStatus = document.getElementById("toggle-status");
const connectionMeta = document.getElementById("connection-meta");
const startAutoplayButton = document.getElementById("start-autoplay-button");
const reconnectButton = document.getElementById("reconnect-button");
const autoplayGameIdInput = document.getElementById("autoplay-game-id");
const customOriginsInput = document.getElementById("custom-origins");
const AUTO_SAVE_DELAY_MS = 450;

let saveGameIdTimeout = null;
let saveOriginsTimeout = null;

function getStatusMessage(enabled, connected, hasActiveBridgeContext, lastConnectionError) {
    if (!enabled) {
        return "Bridge is off. The extension will stay idle until you enable it again.";
    }

    if (connected) {
        return "Connected to ws://127.0.0.1:17381";
    }

    if (!hasActiveBridgeContext) {
        return "Waiting for a supported game tab to become active.";
    }

    if (lastConnectionError) {
        return `${lastConnectionError} Make sure Electron Local WebSocket Server is enabled.`;
    }

    return "Enabled, waiting for Electron local socket...";
}

function applyState(enabled, connected, hasActiveBridgeContext, lastConnectionError) {
    toggleButton.dataset.enabled = String(enabled);
    toggleButton.setAttribute("aria-pressed", String(enabled));
    toggleStatus.textContent = enabled ? "Bridge is enabled" : "Bridge is disabled";
    connectionMeta.textContent = getStatusMessage(enabled, connected, hasActiveBridgeContext, lastConnectionError);
    connectionMeta.className = enabled && connected ? "meta connected" : "meta";
    startAutoplayButton.disabled = !(enabled && connected);
    reconnectButton.disabled = !enabled;
}

function requestState() {
    chrome.runtime.sendMessage({ type: "get-extension-settings" }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
            toggleStatus.textContent = "Unable to load status";
            connectionMeta.textContent = chrome.runtime.lastError?.message || "Bridge status is unavailable.";
            connectionMeta.className = "meta";
            return;
        }

        applyState(
            Boolean(response.enabled),
            Boolean(response.connected),
            Boolean(response.hasActiveBridgeContext),
            typeof response.lastConnectionError === "string" ? response.lastConnectionError : null,
        );
        autoplayGameIdInput.value = typeof response.autoplayGameId === "string" ? response.autoplayGameId : "";
        customOriginsInput.value = Array.isArray(response.customAllowedOrigins)
            ? response.customAllowedOrigins.join("\n")
            : "";
    });
}

function getNormalizedOrigins() {
    return customOriginsInput.value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
}

function saveGameIdSilently() {
    const gameId = autoplayGameIdInput.value.trim();
    chrome.runtime.sendMessage({ type: "set-autoplay-game-id", gameId }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
            connectionMeta.textContent = chrome.runtime.lastError?.message || "Could not auto-save Game ID.";
            connectionMeta.className = "meta";
            return;
        }

        autoplayGameIdInput.value = typeof response.autoplayGameId === "string" ? response.autoplayGameId : "";
        connectionMeta.textContent = "Game ID auto-saved.";
        connectionMeta.className = "meta connected";
    });
}

function saveOriginsSilently() {
    const origins = getNormalizedOrigins();
    chrome.runtime.sendMessage({ type: "set-custom-origins", origins }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
            connectionMeta.textContent = chrome.runtime.lastError?.message || "Could not auto-save custom links.";
            connectionMeta.className = "meta";
            return;
        }

        customOriginsInput.value = Array.isArray(response.customAllowedOrigins)
            ? response.customAllowedOrigins.join("\n")
            : "";
        connectionMeta.textContent = "Custom links auto-saved. Reload the target tab to apply them.";
        connectionMeta.className = "meta connected";
    });
}

toggleButton.addEventListener("click", () => {
    const nextEnabled = toggleButton.dataset.enabled !== "true";
    chrome.runtime.sendMessage({ type: "set-local-socket-state", enabled: nextEnabled }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
            connectionMeta.textContent = chrome.runtime.lastError?.message || "Could not update bridge state.";
            connectionMeta.className = "meta";
            return;
        }

        applyState(
            Boolean(response.enabled),
            Boolean(response.connected),
            Boolean(response.hasActiveBridgeContext),
            typeof response.lastConnectionError === "string" ? response.lastConnectionError : null,
        );
    });
});

startAutoplayButton.addEventListener("click", () => {
    startAutoplayButton.disabled = true;
    chrome.runtime.sendMessage({ type: "start-autoplay-command" }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
            connectionMeta.textContent = chrome.runtime.lastError?.message || "Could not send autoplay command to Electron.";
            connectionMeta.className = "meta";
            requestState();
            return;
        }

        connectionMeta.textContent = "Autoplay command sent to Electron.";
        connectionMeta.className = "meta connected";
        applyState(
            Boolean(response.enabled),
            Boolean(response.connected),
            Boolean(response.hasActiveBridgeContext),
            typeof response.lastConnectionError === "string" ? response.lastConnectionError : null,
        );
        window.close();
    });
});

reconnectButton.addEventListener("click", () => {
    reconnectButton.disabled = true;
    chrome.runtime.sendMessage({ type: "reconnect-local-socket" }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
            connectionMeta.textContent = chrome.runtime.lastError?.message || "Could not reconnect to Electron local socket.";
            connectionMeta.className = "meta";
            requestState();
            return;
        }

        connectionMeta.textContent = "Reconnect requested. Checking Electron local socket again...";
        connectionMeta.className = "meta connected";
        applyState(
            Boolean(response.enabled),
            Boolean(response.connected),
            Boolean(response.hasActiveBridgeContext),
            typeof response.lastConnectionError === "string" ? response.lastConnectionError : null,
        );
        window.setTimeout(requestState, 500);
    });
});

autoplayGameIdInput.addEventListener("input", () => {
    if (saveGameIdTimeout) {
        window.clearTimeout(saveGameIdTimeout);
    }

    saveGameIdTimeout = window.setTimeout(() => {
        saveGameIdSilently();
    }, AUTO_SAVE_DELAY_MS);
});

customOriginsInput.addEventListener("input", () => {
    if (saveOriginsTimeout) {
        window.clearTimeout(saveOriginsTimeout);
    }

    saveOriginsTimeout = window.setTimeout(() => {
        saveOriginsSilently();
    }, AUTO_SAVE_DELAY_MS);
});

requestState();
