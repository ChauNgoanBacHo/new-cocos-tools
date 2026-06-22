const toggleButton = document.getElementById("toggle-button");
const toggleStatus = document.getElementById("toggle-status");
const connectionMeta = document.getElementById("connection-meta");
const startAutoplayButton = document.getElementById("start-autoplay-button");
const reconnectButton = document.getElementById("reconnect-button");
const cheatSpeedInput = document.getElementById("cheat-speed");
const debugToggleButton = document.getElementById("debug-toggle-button");
const autoplayGameIdInput = document.getElementById("autoplay-game-id");
const customOriginsInput = document.getElementById("custom-origins");
const AUTO_SAVE_DELAY_MS = 450;

let saveGameIdTimeout = null;
let saveOriginsTimeout = null;
let saveCheatSpeedTimeout = null;

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
        cheatSpeedInput.value = String(
            typeof response.cheatSpeed === "number" && Number.isFinite(response.cheatSpeed)
                ? response.cheatSpeed
                : 1,
        );
        debugToggleButton.dataset.enabled = String(response.showDebugControls === true);
        debugToggleButton.setAttribute("aria-pressed", String(response.showDebugControls === true));
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
        .map((line) => {
            if (!line) {
                return "";
            }

            try {
                return new URL(line).origin;
            } catch {
                return line;
            }
        })
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

function saveCheatSpeedSilently() {
    const parsedSpeed = Number.parseFloat(cheatSpeedInput.value);
    const speed = Number.isFinite(parsedSpeed) ? Math.max(0.1, parsedSpeed) : 1;

    chrome.runtime.sendMessage({ type: "set-cheat-speed", speed }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
            connectionMeta.textContent = chrome.runtime.lastError?.message || "Could not auto-save cheat speed.";
            connectionMeta.className = "meta";
            return;
        }

        cheatSpeedInput.value = String(response.cheatSpeed);
        connectionMeta.textContent = `Cheat speed set to x${response.cheatSpeed}.`;
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

debugToggleButton.addEventListener("click", () => {
    const enabled = debugToggleButton.dataset.enabled !== "true";
    chrome.runtime.sendMessage({ type: "set-show-debug-controls", enabled }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
            connectionMeta.textContent = chrome.runtime.lastError?.message || "Could not update debug controls.";
            connectionMeta.className = "meta";
            return;
        }

        debugToggleButton.dataset.enabled = String(response.showDebugControls === true);
        debugToggleButton.setAttribute("aria-pressed", String(response.showDebugControls === true));
        connectionMeta.textContent = response.showDebugControls
            ? "Debug controls are visible on the game page."
            : "Debug controls are hidden.";
        connectionMeta.className = "meta connected";
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

cheatSpeedInput.addEventListener("input", () => {
    if (saveCheatSpeedTimeout) {
        window.clearTimeout(saveCheatSpeedTimeout);
    }

    saveCheatSpeedTimeout = window.setTimeout(() => {
        saveCheatSpeedSilently();
    }, AUTO_SAVE_DELAY_MS);
});

requestState();
