const toggleButton = document.getElementById("toggle-button");
const toggleStatus = document.getElementById("toggle-status");
const bridgeMeta = document.getElementById("bridge-meta");
const browserMeta = document.getElementById("browser-meta");
const startAutoplayButton = document.getElementById("start-autoplay-button");
const reconnectButton = document.getElementById("reconnect-button");
const cheatSpeedInput = document.getElementById("cheat-speed");
const debugToggleButton = document.getElementById("debug-toggle-button");
const autoplayGameIdInput = document.getElementById("autoplay-game-id");
const customOriginsInput = document.getElementById("custom-origins");
const debugExcludeListInput = document.getElementById("debug-exclude-list");
const debugHighlightListInput = document.getElementById("debug-highlight-list");
const debugHighlightColorInput = document.getElementById("debug-highlight-color");
const miniLogLinesInput = document.getElementById("mini-log-lines");
const resumeSceneButton = document.getElementById("resume-scene-button");
const AUTO_SAVE_DELAY_MS = 450;

let saveGameIdTimeout = null;
let saveOriginsTimeout = null;
let saveCheatSpeedTimeout = null;
let saveExcludeListTimeout = null;
let saveHighlightListTimeout = null;
let saveHighlightColorTimeout = null;
let saveMiniLogLinesTimeout = null;

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
    bridgeMeta.textContent = getStatusMessage(enabled, connected, hasActiveBridgeContext, lastConnectionError);
    bridgeMeta.className = enabled && connected ? "meta connected" : "meta";
    startAutoplayButton.disabled = !(enabled && connected);
    reconnectButton.disabled = !enabled;
}

function requestState() {
    chrome.runtime.sendMessage({ type: "get-extension-settings" }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
            toggleStatus.textContent = "Unable to load status";
            bridgeMeta.textContent = chrome.runtime.lastError?.message || "Bridge status is unavailable.";
            bridgeMeta.className = "meta";
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
        debugExcludeListInput.value = Array.isArray(response.debugExcludeList)
            ? response.debugExcludeList.join("\n")
            : "";
        debugHighlightListInput.value = Array.isArray(response.debugHighlightList)
            ? response.debugHighlightList.join("\n")
            : "";
        debugHighlightColorInput.value = typeof response.debugHighlightColor === "string"
            ? response.debugHighlightColor
            : "red";
        miniLogLinesInput.value = String(
            typeof response.miniLogLines === "number" && Number.isFinite(response.miniLogLines)
                ? response.miniLogLines
                : 5,
        );
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

function getNormalizedFilterLines(input) {
    return input.value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
}

function saveGameIdSilently() {
    const gameId = autoplayGameIdInput.value.trim();
    chrome.runtime.sendMessage({ type: "set-autoplay-game-id", gameId }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
            bridgeMeta.textContent = chrome.runtime.lastError?.message || "Could not auto-save Game ID.";
            bridgeMeta.className = "meta";
            return;
        }

        autoplayGameIdInput.value = typeof response.autoplayGameId === "string" ? response.autoplayGameId : "";
        bridgeMeta.textContent = "Game ID auto-saved.";
        bridgeMeta.className = "meta connected";
    });
}

function saveOriginsSilently() {
    const origins = getNormalizedOrigins();
    chrome.runtime.sendMessage({ type: "set-custom-origins", origins }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
            browserMeta.textContent = chrome.runtime.lastError?.message || "Could not auto-save custom links.";
            browserMeta.className = "meta browser";
            return;
        }

        customOriginsInput.value = Array.isArray(response.customAllowedOrigins)
            ? response.customAllowedOrigins.join("\n")
            : "";
        browserMeta.textContent = "Custom links auto-saved. Reload the target tab to apply them.";
        browserMeta.className = "meta browser";
    });
}

function saveCheatSpeedSilently() {
    const parsedSpeed = Number.parseFloat(cheatSpeedInput.value);
    const speed = Number.isFinite(parsedSpeed) ? Math.max(0.1, parsedSpeed) : 1;

    chrome.runtime.sendMessage({ type: "set-cheat-speed", speed }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
            browserMeta.textContent = chrome.runtime.lastError?.message || "Could not auto-save cheat speed.";
            browserMeta.className = "meta browser";
            return;
        }

        cheatSpeedInput.value = String(response.cheatSpeed);
        browserMeta.textContent = `Cheat speed set to x${response.cheatSpeed}.`;
        browserMeta.className = "meta browser";
    });
}

function saveDebugExcludeListSilently() {
    const values = getNormalizedFilterLines(debugExcludeListInput);
    chrome.runtime.sendMessage({ type: "set-debug-exclude-list", values }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
            browserMeta.textContent = chrome.runtime.lastError?.message || "Could not auto-save debug exclude list.";
            browserMeta.className = "meta browser";
            return;
        }

        debugExcludeListInput.value = Array.isArray(response.debugExcludeList)
            ? response.debugExcludeList.join("\n")
            : "";
        browserMeta.textContent = "Debug exclude list auto-saved.";
        browserMeta.className = "meta browser";
    });
}

function saveDebugHighlightListSilently() {
    const values = getNormalizedFilterLines(debugHighlightListInput);
    chrome.runtime.sendMessage({ type: "set-debug-highlight-list", values }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
            browserMeta.textContent = chrome.runtime.lastError?.message || "Could not auto-save debug highlight list.";
            browserMeta.className = "meta browser";
            return;
        }

        debugHighlightListInput.value = Array.isArray(response.debugHighlightList)
            ? response.debugHighlightList.join("\n")
            : "";
        browserMeta.textContent = "Debug highlight list auto-saved.";
        browserMeta.className = "meta browser";
    });
}

function saveDebugHighlightColorSilently() {
    const color = typeof debugHighlightColorInput.value === "string" && debugHighlightColorInput.value
        ? debugHighlightColorInput.value
        : "red";

    chrome.runtime.sendMessage({ type: "set-debug-highlight-color", color }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
            browserMeta.textContent = chrome.runtime.lastError?.message || "Could not auto-save debug highlight color.";
            browserMeta.className = "meta browser";
            return;
        }

        debugHighlightColorInput.value = typeof response.debugHighlightColor === "string"
            ? response.debugHighlightColor
            : "red";
        browserMeta.textContent = `Debug highlight color set to ${debugHighlightColorInput.value}.`;
        browserMeta.className = "meta browser";
    });
}

function saveMiniLogLinesSilently() {
    const parsedValue = Number.parseInt(miniLogLinesInput.value, 10);
    const lines = Number.isFinite(parsedValue) ? Math.min(30, Math.max(1, parsedValue)) : 5;

    chrome.runtime.sendMessage({ type: "set-mini-log-lines", lines }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
            browserMeta.textContent = chrome.runtime.lastError?.message || "Could not auto-save mini log lines.";
            browserMeta.className = "meta browser";
            return;
        }

        miniLogLinesInput.value = String(
            typeof response.miniLogLines === "number" && Number.isFinite(response.miniLogLines)
                ? response.miniLogLines
                : 5,
        );
        browserMeta.textContent = `Mini log lines set to ${miniLogLinesInput.value}.`;
        browserMeta.className = "meta browser";
    });
}

toggleButton.addEventListener("click", () => {
    const nextEnabled = toggleButton.dataset.enabled !== "true";
    chrome.runtime.sendMessage({ type: "set-local-socket-state", enabled: nextEnabled }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
            bridgeMeta.textContent = chrome.runtime.lastError?.message || "Could not update bridge state.";
            bridgeMeta.className = "meta";
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
            bridgeMeta.textContent = chrome.runtime.lastError?.message || "Could not send autoplay command to Electron.";
            bridgeMeta.className = "meta";
            requestState();
            return;
        }

        bridgeMeta.textContent = "Autoplay command sent to Electron.";
        bridgeMeta.className = "meta connected";
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
            bridgeMeta.textContent = chrome.runtime.lastError?.message || "Could not reconnect to Electron local socket.";
            bridgeMeta.className = "meta";
            requestState();
            return;
        }

        bridgeMeta.textContent = "Reconnect requested. Checking Electron local socket again...";
        bridgeMeta.className = "meta connected";
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
            browserMeta.textContent = chrome.runtime.lastError?.message || "Could not update debug controls.";
            browserMeta.className = "meta browser";
            return;
        }

        debugToggleButton.dataset.enabled = String(response.showDebugControls === true);
        debugToggleButton.setAttribute("aria-pressed", String(response.showDebugControls === true));
        browserMeta.textContent = response.showDebugControls
            ? "Debug controls are visible on the game page."
            : "Debug controls are hidden.";
        browserMeta.className = "meta browser";
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

debugExcludeListInput.addEventListener("input", () => {
    if (saveExcludeListTimeout) {
        window.clearTimeout(saveExcludeListTimeout);
    }

    saveExcludeListTimeout = window.setTimeout(() => {
        saveDebugExcludeListSilently();
    }, AUTO_SAVE_DELAY_MS);
});

debugHighlightListInput.addEventListener("input", () => {
    if (saveHighlightListTimeout) {
        window.clearTimeout(saveHighlightListTimeout);
    }

    saveHighlightListTimeout = window.setTimeout(() => {
        saveDebugHighlightListSilently();
    }, AUTO_SAVE_DELAY_MS);
});

debugHighlightColorInput.addEventListener("change", () => {
    if (saveHighlightColorTimeout) {
        window.clearTimeout(saveHighlightColorTimeout);
    }

    saveHighlightColorTimeout = window.setTimeout(() => {
        saveDebugHighlightColorSilently();
    }, 0);
});

miniLogLinesInput.addEventListener("input", () => {
    if (saveMiniLogLinesTimeout) {
        window.clearTimeout(saveMiniLogLinesTimeout);
    }

    saveMiniLogLinesTimeout = window.setTimeout(() => {
        saveMiniLogLinesSilently();
    }, AUTO_SAVE_DELAY_MS);
});

function refreshCdpState() {
    chrome.runtime.sendMessage({ type: "get-cdp-state" }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
            resumeSceneButton.disabled = true;
            return;
        }
        resumeSceneButton.disabled = !response.paused;
        resumeSceneButton.textContent = response.paused ? "Resume Scene (paused)" : "Resume Scene";
    });
}

resumeSceneButton.addEventListener("click", () => {
    resumeSceneButton.disabled = true;
    chrome.runtime.sendMessage({ type: "cdp-resume-scene" }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
            browserMeta.textContent = chrome.runtime.lastError?.message || "Could not resume scene.";
            browserMeta.className = "meta browser";
            refreshCdpState();
            return;
        }
        browserMeta.textContent = "Scene resumed.";
        browserMeta.className = "meta browser";
        refreshCdpState();
    });
});

requestState();
refreshCdpState();
