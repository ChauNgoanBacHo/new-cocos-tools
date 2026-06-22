const statusMeta = document.getElementById("status-meta");
const refreshButton = document.getElementById("refresh-button");
const cheatSpeedInput = document.getElementById("cheat-speed");
const debugToggleButton = document.getElementById("debug-toggle-button");
const AUTO_SAVE_DELAY_MS = 450;

let saveCheatSpeedTimeout = null;

function setStatus(message) {
    statusMeta.textContent = message;
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
    });
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

cheatSpeedInput.addEventListener("input", () => {
    if (saveCheatSpeedTimeout) {
        window.clearTimeout(saveCheatSpeedTimeout);
    }

    saveCheatSpeedTimeout = window.setTimeout(() => {
        saveCheatSpeedSilently();
    }, AUTO_SAVE_DELAY_MS);
});

requestState();
