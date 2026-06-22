(function () {
    const PAGE_CONTROL_EVENT_TYPE = "ONE_PUNCH_TOOLS_PAGE_CONTROL";
    const DEFAULT_ALLOWED_ORIGINS = [
        "http://localhost:7456",
        "https://iframe-tektale.staging.enostd.gay",
        "https://webapp5tek.enostd.gay",
    ];
    const OVERLAY_ID = "one-punch-devkit-debug-controls";
    const cheatControlState = {
        configuredSpeed: 1,
        boostEnabled: false,
        paused: false,
        overlayVisible: false,
        overlayRoot: null,
        overlayPauseButton: null,
        overlaySpeedButton: null,
        overlayResetButton: null,
        runtime: null,
        version: null,
        scheduler: null,
        originalTick: null,
    };
    const currentScript = document.currentScript;
    const customAllowedOrigins = parseAllowedOrigins(currentScript?.dataset?.allowedOrigins);
    const allowedOrigins = new Set([...DEFAULT_ALLOWED_ORIGINS, ...customAllowedOrigins]);

    if (!allowedOrigins.has(window.location.origin)) {
        return;
    }

    function getCocosRuntime() {
        const cc = window.cc;
        if (!cc || !cc.director) {
            return null;
        }

        const versionText = String(cc.ENGINE_VERSION || cc.engineVersion || "").trim();
        const majorVersion = Number.parseInt(versionText.split(".")[0], 10);
        const version = Number.isFinite(majorVersion) && majorVersion >= 3 ? "3" : "2";

        return { cc, version };
    }

    function ensureSpeedHook() {
        const runtime = getCocosRuntime();
        if (!runtime) {
            return false;
        }

        cheatControlState.runtime = runtime.cc;
        cheatControlState.version = runtime.version;

        if (runtime.version === "3") {
            if (cheatControlState.originalTick) {
                return true;
            }

            const originalTick = runtime.cc.director.tick || runtime.cc.Director?.prototype?.tick;
            if (typeof originalTick !== "function") {
                return false;
            }

            cheatControlState.originalTick = originalTick;
            runtime.cc.director.tick = function patchedTick(dt, ...args) {
                const effectiveSpeed = cheatControlState.boostEnabled ? cheatControlState.configuredSpeed : 1;
                return originalTick.call(runtime.cc.director, dt * effectiveSpeed, ...args);
            };
            return true;
        }

        if (!cheatControlState.scheduler && typeof runtime.cc.director.getScheduler === "function") {
            cheatControlState.scheduler = runtime.cc.director.getScheduler();
        }

        return Boolean(cheatControlState.scheduler);
    }

    function applySpeed() {
        if (!ensureSpeedHook()) {
            return false;
        }

        if (cheatControlState.version === "3") {
            return true;
        }

        if (cheatControlState.scheduler && typeof cheatControlState.scheduler.setTimeScale === "function") {
            cheatControlState.scheduler.setTimeScale(cheatControlState.boostEnabled ? cheatControlState.configuredSpeed : 1);
            return true;
        }

        return false;
    }

    function setCheatSpeed(speed) {
        const normalizedSpeed = Number.isFinite(Number(speed)) ? Math.max(0.1, Number(speed)) : 1;
        cheatControlState.configuredSpeed = normalizedSpeed;
        applySpeed();
        updateOverlayUi();
    }

    function toggleSpeedBoost() {
        cheatControlState.boostEnabled = !cheatControlState.boostEnabled;
        applySpeed();
        updateOverlayUi();
    }

    function resetSpeed() {
        cheatControlState.configuredSpeed = 1;
        cheatControlState.boostEnabled = false;

        if (cheatControlState.version === "2" && cheatControlState.scheduler && typeof cheatControlState.scheduler.setTimeScale === "function") {
            cheatControlState.scheduler.setTimeScale(1);
        }

        updateOverlayUi();
    }

    function pauseGame() {
        const runtime = getCocosRuntime();
        if (!runtime) {
            return false;
        }

        if (typeof runtime.cc.game?.pause === "function") {
            runtime.cc.game.pause();
        } else if (typeof runtime.cc.director?.pause === "function") {
            runtime.cc.director.pause();
        } else {
            return false;
        }

        cheatControlState.paused = true;
        updateOverlayUi();
        return true;
    }

    function resumeGame() {
        const runtime = getCocosRuntime();
        if (!runtime) {
            return false;
        }

        if (typeof runtime.cc.game?.resume === "function") {
            runtime.cc.game.resume();
        } else if (typeof runtime.cc.director?.resume === "function") {
            runtime.cc.director.resume();
        } else {
            return false;
        }

        cheatControlState.paused = false;
        applySpeed();
        updateOverlayUi();
        return true;
    }

    function togglePause() {
        if (cheatControlState.paused) {
            return resumeGame();
        }

        return pauseGame();
    }

    function ensureOverlay() {
        if (cheatControlState.overlayRoot?.isConnected) {
            return cheatControlState.overlayRoot;
        }

        const root = document.createElement("div");
        root.id = OVERLAY_ID;
        root.style.position = "fixed";
        root.style.top = "10px";
        root.style.right = "16px";
        root.style.zIndex = "2147483647";
        root.style.display = "flex";
        root.style.alignItems = "center";
        root.style.gap = "5px";
        root.style.padding = "6px";
        root.style.borderRadius = "14px";
        root.style.background = "rgba(8, 11, 18, 0.88)";
        root.style.border = "1px solid rgba(255, 255, 255, 0.12)";
        root.style.boxShadow = "0 14px 28px rgba(0, 0, 0, 0.28)";
        root.style.backdropFilter = "blur(12px)";
        root.style.fontFamily = "Arial, sans-serif";

        function createIconButton() {
            const button = document.createElement("button");
            button.type = "button";
            button.style.height = "30px";
            button.style.width = "30px";
            button.style.minWidth = "30px";
            button.style.padding = "0";
            button.style.border = "none";
            button.style.borderRadius = "9px";
            button.style.color = "#ffffff";
            button.style.cursor = "pointer";
            button.style.fontSize = "12px";
            button.style.fontWeight = "700";
            button.style.display = "inline-flex";
            button.style.alignItems = "center";
            button.style.justifyContent = "center";
            button.style.lineHeight = "1";
            return button;
        }

        const pauseButton = createIconButton();
        pauseButton.addEventListener("click", () => {
            togglePause();
        });

        const speedButton = createIconButton();
        speedButton.addEventListener("click", () => {
            toggleSpeedBoost();
        });

        const resetButton = createIconButton();
        resetButton.addEventListener("click", () => {
            resetSpeed();
        });

        root.appendChild(pauseButton);
        root.appendChild(speedButton);
        root.appendChild(resetButton);
        (document.body || document.documentElement).appendChild(root);

        cheatControlState.overlayRoot = root;
        cheatControlState.overlayPauseButton = pauseButton;
        cheatControlState.overlaySpeedButton = speedButton;
        cheatControlState.overlayResetButton = resetButton;
        updateOverlayUi();

        return root;
    }

    function updateOverlayUi() {
        if (!cheatControlState.overlayPauseButton || !cheatControlState.overlaySpeedButton || !cheatControlState.overlayResetButton) {
            return;
        }

        cheatControlState.overlayPauseButton.textContent = cheatControlState.paused ? "▶" : "❚❚";
        cheatControlState.overlayPauseButton.title = cheatControlState.paused ? "Resume game" : "Pause game";
        cheatControlState.overlayPauseButton.style.background = cheatControlState.paused ? "#16a34a" : "#dc2626";

        cheatControlState.overlaySpeedButton.textContent = "⚡";
        cheatControlState.overlaySpeedButton.title = cheatControlState.boostEnabled
            ? `Pause speed boost (${cheatControlState.configuredSpeed.toFixed(1)}x)`
            : `Play speed boost (${cheatControlState.configuredSpeed.toFixed(1)}x)`;
        cheatControlState.overlaySpeedButton.style.background = cheatControlState.boostEnabled ? "#7c3aed" : "#334155";

        cheatControlState.overlayResetButton.textContent = "x1.0";
        cheatControlState.overlayResetButton.title = `Reset speed to x1.0 (current x${cheatControlState.configuredSpeed.toFixed(1)})`;
        cheatControlState.overlayResetButton.style.background = "#475569";
        cheatControlState.overlayResetButton.style.width = "42px";
        cheatControlState.overlayResetButton.style.minWidth = "42px";
        cheatControlState.overlayResetButton.style.fontSize = "10px";
    }

    function setOverlayVisibility(enabled) {
        cheatControlState.overlayVisible = enabled === true;
        if (!cheatControlState.overlayVisible) {
            if (cheatControlState.overlayRoot) {
                cheatControlState.overlayRoot.remove();
            }
            cheatControlState.overlayRoot = null;
            cheatControlState.overlayPauseButton = null;
            cheatControlState.overlaySpeedButton = null;
            cheatControlState.overlayResetButton = null;
            return;
        }

        ensureOverlay();
    }

    function handlePageControl(command, payload) {
        switch (command) {
            case "set-speed":
                setCheatSpeed(payload?.speed);
                break;
            case "set-debug-visibility":
                setOverlayVisibility(payload?.enabled === true);
                break;
            default:
                break;
        }
    }

    function parseAllowedOrigins(rawValue) {
        if (typeof rawValue !== "string" || !rawValue.trim()) {
            return [];
        }

        try {
            const parsed = JSON.parse(rawValue);
            return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [];
        } catch {
            return [];
        }
    }

    window.addEventListener("message", (event) => {
        if (event.source !== window) {
            return;
        }

        const data = event.data;
        if (!data || data.source !== PAGE_CONTROL_EVENT_TYPE) {
            return;
        }

        handlePageControl(data.command, data.payload ?? {});
    });
})();
