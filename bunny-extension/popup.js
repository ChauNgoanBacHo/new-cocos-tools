const browserMeta = document.getElementById("browser-meta");
const cheatSpeedInput = document.getElementById("cheat-speed");
const debugToggleButton = document.getElementById("debug-toggle-button");
const customOriginsInput = document.getElementById("custom-origins");
const debugExcludeListInput = document.getElementById("debug-exclude-list");
const debugHighlightListInput = document.getElementById("debug-highlight-list");
const debugHighlightColorInput = document.getElementById("debug-highlight-color");
const AUTO_SAVE_DELAY_MS = 450;

let saveOriginsTimeout = null;
let saveCheatSpeedTimeout = null;
let saveExcludeListTimeout = null;
let saveHighlightListTimeout = null;
let saveHighlightColorTimeout = null;

function requestState() {
    chrome.runtime.sendMessage({ type: "get-extension-settings" }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
            browserMeta.textContent = chrome.runtime.lastError?.message || "Settings are unavailable.";
            browserMeta.className = "meta browser";
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
        debugExcludeListInput.value = Array.isArray(response.debugExcludeList)
            ? response.debugExcludeList.join("\n")
            : "";
        debugHighlightListInput.value = Array.isArray(response.debugHighlightList)
            ? response.debugHighlightList.join("\n")
            : "";
        debugHighlightColorInput.value = typeof response.debugHighlightColor === "string"
            ? response.debugHighlightColor
            : "red";
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

requestState();
