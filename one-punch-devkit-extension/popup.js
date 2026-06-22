const statusMeta = document.getElementById("status-meta");
const refreshButton = document.getElementById("refresh-button");
const pauseButton = document.getElementById("pause-button");
const speedButton = document.getElementById("speed-button");
const resetSpeedButton = document.getElementById("reset-speed-button");
const cheatSpeedInput = document.getElementById("cheat-speed");
const debugToggleButton = document.getElementById("debug-toggle-button");
const customOriginsInput = document.getElementById("custom-origins");
const AUTO_SAVE_DELAY_MS = 450;

let saveOriginsTimeout = null;
let saveCheatSpeedTimeout = null;

function setStatus(message) {
    statusMeta.textContent = message;
}

function applyDebugButtonState(debugState) {
    const paused = debugState?.paused === true;
    const boostEnabled = debugState?.boostEnabled === true;

    pauseButton.dataset.active = String(paused);
    pauseButton.textContent = paused ? "Resume" : "Pause";

    speedButton.dataset.active = String(boostEnabled);
    speedButton.textContent = boostEnabled ? "Speed On" : "Speed Off";

    resetSpeedButton.dataset.active = "false";
}

function requestState() {
    chrome.runtime.sendMessage({ type: "get-extension-settings" }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
            setStatus(chrome.runtime.lastError?.message || "Could not load extension settings.");
            return;
        }

        cheatSpeedInput.value = String(
            typeof response.cheatSpeed === "number" && Number.isFinite(response.cheatSpeed)
                ? response.cheatSpeed
                : 1,
        );
        debugToggleButton.dataset.enabled = String(response.showDebugControls === true);
        debugToggleButton.setAttribute("aria-pressed", String(response.showDebugControls === true));
        customOriginsInput.value = Array.isArray(response.customAllowedOrigins)
            ? response.customAllowedOrigins.join("\n")
            : "";
        applyDebugButtonState(response.debugState);
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

function saveCheatSpeedSilently() {
    const parsedSpeed = Number.parseFloat(cheatSpeedInput.value);
    const speed = Number.isFinite(parsedSpeed) ? Math.max(0.1, parsedSpeed) : 1;

    chrome.runtime.sendMessage({ type: "set-cheat-speed", speed }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
            setStatus(chrome.runtime.lastError?.message || "Could not save cheat speed.");
            return;
        }

        cheatSpeedInput.value = String(response.cheatSpeed);
        setStatus(`Cheat speed saved as x${response.cheatSpeed}.`);
    });
}

function saveOriginsSilently() {
    const origins = getNormalizedOrigins();
    chrome.runtime.sendMessage({ type: "set-custom-origins", origins }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
            setStatus(chrome.runtime.lastError?.message || "Could not save custom links.");
            return;
        }

        customOriginsInput.value = Array.isArray(response.customAllowedOrigins)
            ? response.customAllowedOrigins.join("\n")
            : "";
        setStatus("Custom links saved. Reload the target tab if you added a new domain.");
    });
}


debugToggleButton.addEventListener("click", () => {
    const enabled = debugToggleButton.dataset.enabled !== "true";
    chrome.runtime.sendMessage({ type: "set-show-debug-controls", enabled }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
            setStatus(chrome.runtime.lastError?.message || "Could not update debug controls.");
            return;
        }

        debugToggleButton.dataset.enabled = String(response.showDebugControls === true);
        debugToggleButton.setAttribute("aria-pressed", String(response.showDebugControls === true));
        setStatus(response.showDebugControls
            ? "Debug controls are visible on supported tabs."
            : "Debug controls are hidden.");
    });
});

refreshButton.addEventListener("click", () => {
    refreshButton.disabled = true;
    chrome.runtime.sendMessage({ type: "refresh-debug-controls" }, (response) => {
        refreshButton.disabled = false;

        if (chrome.runtime.lastError || !response?.ok) {
            setStatus(chrome.runtime.lastError?.message || "Could not refresh active tab controls.");
            return;
        }

        setStatus("Active tab controls refreshed.");
    });
});

pauseButton.addEventListener("click", () => {
    pauseButton.disabled = true;
    chrome.runtime.sendMessage({ type: "toggle-game-pause" }, (response) => {
        pauseButton.disabled = false;

        if (chrome.runtime.lastError || !response?.ok) {
            setStatus(chrome.runtime.lastError?.message || "Could not toggle pause on the active tab.");
            return;
        }

        setStatus("Pause or resume command sent to the active tab.");
        requestState();
    });
});

speedButton.addEventListener("click", () => {
    speedButton.disabled = true;
    chrome.runtime.sendMessage({ type: "toggle-speed-boost" }, (response) => {
        speedButton.disabled = false;

        if (chrome.runtime.lastError || !response?.ok) {
            setStatus(chrome.runtime.lastError?.message || "Could not toggle speed boost on the active tab.");
            return;
        }

        setStatus(`Speed boost command sent using x${response.cheatSpeed}.`);
        requestState();
    });
});

resetSpeedButton.addEventListener("click", () => {
    resetSpeedButton.disabled = true;
    chrome.runtime.sendMessage({ type: "reset-speed-boost" }, (response) => {
        resetSpeedButton.disabled = false;

        if (chrome.runtime.lastError || !response?.ok) {
            setStatus(chrome.runtime.lastError?.message || "Could not reset speed on the active tab.");
            return;
        }

        setStatus("Speed reset command sent to the active tab.");
        requestState();
    });
});

cheatSpeedInput.addEventListener("input", () => {
    if (saveCheatSpeedTimeout) {
        window.clearTimeout(saveCheatSpeedTimeout);
    }

    saveCheatSpeedTimeout = window.setTimeout(() => {
        saveCheatSpeedSilently();
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
