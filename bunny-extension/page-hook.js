(function () {
    if (window.__BUNNY_TOOLS_PAGE_HOOK_ACTIVE__) {
        return;
    }
    const PAGE_CONTROL_EVENT_TYPE = "BUNNY_TOOLS_PAGE_CONTROL";
    const OVERLAY_ID = "bunny-debug-controls";
    const OVERLAY_POSITION_STORAGE_KEY = "bunny-overlay-position";
    const OVERLAY_VIEWPORT_MARGIN = 8;
    let overlayRestoreObserver = null;
    let overlayResizeHandlerBound = false;
    let debugExcludeList = [];
    let debugHighlightList = [];
    let debugHighlightColor = "red";
    const cheatControlState = {
        configuredSpeed: 1,
        boostEnabled: false,
        paused: false,
        stepFramePending: false,
        overlayVisible: false,
        overlayRoot: null,
        overlayPosition: null,
        overlayPauseButton: null,
        overlaySpeedButton: null,
        overlayNextFrameButton: null,
        overlayResetButton: null,
        runtime: null,
        version: null,
        scheduler: null,
        originalTick: null,
    };
    const currentScript = document.currentScript;
    const customAllowedOrigins = parseAllowedOrigins(currentScript?.dataset?.allowedOrigins);
    const allowedOrigins = new Set(customAllowedOrigins);

    if (!allowedOrigins.has(window.location.origin)) {
        return;
    }

    window.__BUNNY_TOOLS_PAGE_HOOK_ACTIVE__ = true;

    function normalizeFilterText(value) {
        if (typeof value !== "string") {
            return "";
        }

        return value
            .replace(/\\x20/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function matchesHighlightRule(rawText) {
        const normalizedText = normalizeFilterText(rawText);
        if (!normalizedText) {
            return false;
        }

        const normalizedHighlightList = debugHighlightList
            .map(normalizeFilterText)
            .filter(Boolean);

        return normalizedHighlightList.some((entry) => normalizedText.includes(entry));
    }

    function shouldSuppressConsoleLine(rawText) {
        const normalizedText = normalizeFilterText(rawText);
        if (!normalizedText) {
            return false;
        }

        const normalizedExcludeList = debugExcludeList
            .map(normalizeFilterText)
            .filter(Boolean);

        return normalizedExcludeList.some((entry) => normalizedText.includes(entry));
    }

    function getHighlightMeta(rawText) {
        if (!matchesHighlightRule(rawText)) {
            return null;
        }

        return {
            color: debugHighlightColor,
        };
    }

    function getConsoleHighlightStyle(color) {
        switch (color) {
            case "amber":
                return "color: #facc15; text-shadow: 0 0 8px rgba(250, 204, 21, 0.35); font-weight: 700;";
            case "cyan":
                return "color: #c084fc; text-shadow: 0 0 8px rgba(192, 132, 252, 0.35); font-weight: 700;";
            case "red":
            default:
                return "color: #ff4d6d; text-shadow: 0 0 8px rgba(255, 77, 109, 0.35); font-weight: 700;";
        }
    }

    function stringifyConsoleArg(value) {
        if (typeof value === "string") {
            return value;
        }

        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }

    function buildHighlightedConsoleText(args) {
        if (!Array.isArray(args) || args.length === 0) {
            return "";
        }

        const firstArg = args[0];
        if (typeof firstArg !== "string" || !/%[csdifoOj]/.test(firstArg)) {
            return args.map(stringifyConsoleArg).join(" ").trim();
        }

        let argIndex = 1;
        let output = "";

        for (let i = 0; i < firstArg.length; i += 1) {
            const char = firstArg[i];
            if (char === "%" && i + 1 < firstArg.length) {
                const spec = firstArg[i + 1];
                if (spec === "%") {
                    output += "%";
                    i += 1;
                    continue;
                }
                if (spec === "c") {
                    argIndex += 1;
                    i += 1;
                    continue;
                }
                if ("sdifoOj".includes(spec)) {
                    if (argIndex < args.length) {
                        output += stringifyConsoleArg(args[argIndex]);
                        argIndex += 1;
                    }
                    i += 1;
                    continue;
                }
            }
            output += char;
        }

        for (; argIndex < args.length; argIndex += 1) {
            output += ` ${stringifyConsoleArg(args[argIndex])}`;
        }

        return output.trim();
    }

    function emitHighlightedConsoleLine(originalMethod, rendered) {
        const highlightMeta = getHighlightMeta(rendered);
        if (!highlightMeta) {
            return false;
        }

        const highlightStyle = getConsoleHighlightStyle(highlightMeta.color);
        originalMethod.call(window.console, `%c${rendered}`, highlightStyle);
        return true;
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

    function setBaseSpeedScale(scale) {
        if (cheatControlState.version === "2" && cheatControlState.scheduler && typeof cheatControlState.scheduler.setTimeScale === "function") {
            cheatControlState.scheduler.setTimeScale(scale);
        }
    }

    function getDirectorFrameEvent(runtime) {
        return runtime?.cc?.Director?.EVENT_AFTER_DRAW
            || runtime?.cc?.Director?.EVENT_AFTER_UPDATE
            || null;
    }

    function stepNextFrame() {
        const runtime = getCocosRuntime();
        if (!runtime || cheatControlState.stepFramePending || !cheatControlState.paused) {
            return false;
        }

        const director = runtime.cc.director;
        const frameEvent = getDirectorFrameEvent(runtime);
        if (!director || typeof director.once !== "function" || !frameEvent) {
            return false;
        }

        cheatControlState.runtime = runtime.cc;
        cheatControlState.version = runtime.version;
        cheatControlState.stepFramePending = true;

        const restoreBoost = cheatControlState.boostEnabled;
        if (restoreBoost) {
            setBaseSpeedScale(1);
        }

        director.once(frameEvent, () => {
            cheatControlState.stepFramePending = false;
            pauseGame();
            if (restoreBoost) {
                applySpeed();
            }
            updateOverlayUi();
        });

        const resumed = resumeGame();
        if (!resumed) {
            cheatControlState.stepFramePending = false;
            if (restoreBoost) {
                applySpeed();
            }
            updateOverlayUi();
            return false;
        }

        updateOverlayUi();
        return true;
    }

    function loadOverlayPosition() {
        try {
            const raw = window.localStorage.getItem(OVERLAY_POSITION_STORAGE_KEY);
            if (!raw) {
                return null;
            }
            const parsed = JSON.parse(raw);
            if (Number.isFinite(parsed?.left) && Number.isFinite(parsed?.top)) {
                return { left: parsed.left, top: parsed.top };
            }
        } catch (error) {
            // ignore malformed or unavailable storage
        }
        return null;
    }

    function saveOverlayPosition(position) {
        try {
            window.localStorage.setItem(OVERLAY_POSITION_STORAGE_KEY, JSON.stringify(position));
        } catch (error) {
            // ignore unavailable storage
        }
    }

    function clampOverlayPosition(left, top, width, height) {
        const maxLeft = Math.max(OVERLAY_VIEWPORT_MARGIN, window.innerWidth - width - OVERLAY_VIEWPORT_MARGIN);
        const maxTop = Math.max(OVERLAY_VIEWPORT_MARGIN, window.innerHeight - height - OVERLAY_VIEWPORT_MARGIN);
        return {
            left: Math.min(Math.max(OVERLAY_VIEWPORT_MARGIN, left), maxLeft),
            top: Math.min(Math.max(OVERLAY_VIEWPORT_MARGIN, top), maxTop),
        };
    }

    function applyOverlayPosition(position) {
        const root = cheatControlState.overlayRoot;
        if (!root) {
            return;
        }
        const width = root.offsetWidth || 0;
        const height = root.offsetHeight || 0;
        const clamped = clampOverlayPosition(position.left, position.top, width, height);
        cheatControlState.overlayPosition = clamped;
        root.style.right = "auto";
        root.style.left = `${clamped.left}px`;
        root.style.top = `${clamped.top}px`;
    }

    function setupOverlayDrag(handle) {
        const root = cheatControlState.overlayRoot;
        if (!root) {
            return;
        }

        let dragging = false;
        let pointerId = null;
        let startX = 0;
        let startY = 0;
        let originLeft = 0;
        let originTop = 0;

        function onPointerMove(event) {
            if (!dragging) {
                return;
            }
            applyOverlayPosition({
                left: originLeft + (event.clientX - startX),
                top: originTop + (event.clientY - startY),
            });
        }

        function onPointerUp() {
            if (!dragging) {
                return;
            }
            dragging = false;
            handle.style.cursor = "grab";
            window.removeEventListener("pointermove", onPointerMove, true);
            window.removeEventListener("pointerup", onPointerUp, true);
            if (pointerId !== null && handle.releasePointerCapture) {
                try {
                    handle.releasePointerCapture(pointerId);
                } catch (error) {
                    // ignore
                }
            }
            pointerId = null;
            if (cheatControlState.overlayPosition) {
                saveOverlayPosition(cheatControlState.overlayPosition);
            }
        }

        handle.addEventListener("pointerdown", (event) => {
            if (event.button !== 0) {
                return;
            }
            event.preventDefault();
            const rect = root.getBoundingClientRect();
            dragging = true;
            startX = event.clientX;
            startY = event.clientY;
            originLeft = rect.left;
            originTop = rect.top;
            handle.style.cursor = "grabbing";
            pointerId = event.pointerId;
            if (handle.setPointerCapture) {
                try {
                    handle.setPointerCapture(pointerId);
                } catch (error) {
                    // ignore
                }
            }
            window.addEventListener("pointermove", onPointerMove, true);
            window.addEventListener("pointerup", onPointerUp, true);
        });
    }

    function ensureOverlay() {
        if (cheatControlState.overlayRoot?.isConnected) {
            return cheatControlState.overlayRoot;
        }

        document.getElementById(OVERLAY_ID)?.remove();

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

        const dragHandle = document.createElement("div");
        dragHandle.title = "Drag to move";
        dragHandle.textContent = "⠿";
        dragHandle.style.height = "30px";
        dragHandle.style.width = "18px";
        dragHandle.style.minWidth = "18px";
        dragHandle.style.display = "inline-flex";
        dragHandle.style.alignItems = "center";
        dragHandle.style.justifyContent = "center";
        dragHandle.style.color = "rgba(255, 255, 255, 0.55)";
        dragHandle.style.fontSize = "15px";
        dragHandle.style.lineHeight = "1";
        dragHandle.style.cursor = "grab";
        dragHandle.style.userSelect = "none";
        dragHandle.style.webkitUserSelect = "none";
        dragHandle.style.touchAction = "none";

        const pauseButton = createIconButton();
        pauseButton.addEventListener("click", () => {
            togglePause();
        });

        const speedButton = createIconButton();
        speedButton.addEventListener("click", () => {
            toggleSpeedBoost();
        });

        const nextFrameButton = createIconButton();
        nextFrameButton.addEventListener("click", () => {
            stepNextFrame();
        });

        const resetButton = createIconButton();
        resetButton.addEventListener("click", () => {
            resetSpeed();
        });

        root.appendChild(dragHandle);
        root.appendChild(pauseButton);
        root.appendChild(nextFrameButton);
        root.appendChild(speedButton);
        root.appendChild(resetButton);
        (document.body || document.documentElement).appendChild(root);

        cheatControlState.overlayRoot = root;
        cheatControlState.overlayPauseButton = pauseButton;
        cheatControlState.overlaySpeedButton = speedButton;
        cheatControlState.overlayNextFrameButton = nextFrameButton;
        cheatControlState.overlayResetButton = resetButton;

        setupOverlayDrag(dragHandle);
        const savedPosition = cheatControlState.overlayPosition || loadOverlayPosition();
        if (savedPosition) {
            applyOverlayPosition(savedPosition);
        }

        if (!overlayResizeHandlerBound) {
            overlayResizeHandlerBound = true;
            window.addEventListener("resize", () => {
                if (cheatControlState.overlayRoot && cheatControlState.overlayPosition) {
                    applyOverlayPosition(cheatControlState.overlayPosition);
                }
            });
        }

        updateOverlayUi();

        return root;
    }

    function ensureOverlayRestoreObserver() {
        if (overlayRestoreObserver || typeof MutationObserver === "undefined") {
            return;
        }

        overlayRestoreObserver = new MutationObserver(() => {
            if (!cheatControlState.overlayVisible) {
                return;
            }

            if (!document.getElementById(OVERLAY_ID)) {
                cheatControlState.overlayRoot = null;
                cheatControlState.overlayPauseButton = null;
                cheatControlState.overlaySpeedButton = null;
                cheatControlState.overlayNextFrameButton = null;
                cheatControlState.overlayResetButton = null;
                ensureOverlay();
            }
        });

        overlayRestoreObserver.observe(document.documentElement || document.body, {
            childList: true,
            subtree: true,
        });
    }

    function updateOverlayUi() {
        if (
            !cheatControlState.overlayRoot
            || !cheatControlState.overlayPauseButton
            || !cheatControlState.overlaySpeedButton
            || !cheatControlState.overlayNextFrameButton
            || !cheatControlState.overlayResetButton
        ) {
            return;
        }

        cheatControlState.overlayRoot.style.display = "flex";

        cheatControlState.overlayPauseButton.textContent = cheatControlState.paused ? "▶" : "❚❚";
        cheatControlState.overlayPauseButton.title = cheatControlState.paused ? "Resume game" : "Pause game";
        cheatControlState.overlayPauseButton.style.background = cheatControlState.paused ? "#16a34a" : "#dc2626";

        cheatControlState.overlaySpeedButton.textContent = "⚡";
        cheatControlState.overlaySpeedButton.title = cheatControlState.boostEnabled
            ? `Pause speed boost (${cheatControlState.configuredSpeed.toFixed(1)}x)`
            : `Play speed boost (${cheatControlState.configuredSpeed.toFixed(1)}x)`;
        cheatControlState.overlaySpeedButton.style.background = cheatControlState.boostEnabled ? "#7c3aed" : "#334155";

        cheatControlState.overlayNextFrameButton.textContent = "⏭";
        const canStepFrame = cheatControlState.paused && !cheatControlState.stepFramePending;
        cheatControlState.overlayNextFrameButton.title = cheatControlState.stepFramePending
            ? "Advancing one frame..."
            : cheatControlState.paused
                ? "Step next frame"
                : "Pause the game before stepping frame-by-frame";
        cheatControlState.overlayNextFrameButton.disabled = !canStepFrame;
        cheatControlState.overlayNextFrameButton.style.opacity = canStepFrame ? "1" : "0.55";
        cheatControlState.overlayNextFrameButton.style.cursor = cheatControlState.stepFramePending
            ? "progress"
            : canStepFrame
                ? "pointer"
                : "not-allowed";
        cheatControlState.overlayNextFrameButton.style.background = cheatControlState.stepFramePending
            ? "#7f1d1d"
            : canStepFrame
                ? "#991b1b"
                : "#3f3f46";

        cheatControlState.overlayResetButton.textContent = "x1.0";
        cheatControlState.overlayResetButton.title = `Reset speed to x1.0 (current x${cheatControlState.configuredSpeed.toFixed(1)})`;
        cheatControlState.overlayResetButton.style.background = "#475569";
    }

    function setOverlayVisibility(enabled) {
        cheatControlState.overlayVisible = enabled === true;
        if (!cheatControlState.overlayVisible) {
            if (cheatControlState.overlayRoot) {
                cheatControlState.overlayRoot.style.display = "none";
            }
            return;
        }

        ensureOverlayRestoreObserver();
        ensureOverlay();
        updateOverlayUi();
    }

    function handlePageControl(command, payload) {
        switch (command) {
            case "set-speed":
                setCheatSpeed(payload?.speed);
                break;
            case "toggle-speed-boost":
                if (Number.isFinite(Number(payload?.speed))) {
                    cheatControlState.configuredSpeed = Math.max(0.1, Number(payload.speed));
                }
                toggleSpeedBoost();
                break;
            case "toggle-pause":
                togglePause();
                break;
            case "step-next-frame":
                stepNextFrame();
                break;
            case "set-debug-visibility":
                setOverlayVisibility(payload?.enabled === true);
                break;
            case "set-debug-filter-lists":
                debugExcludeList = Array.isArray(payload?.excludeList)
                    ? payload.excludeList.filter((value) => typeof value === "string")
                    : [];
                debugHighlightList = Array.isArray(payload?.highlightList)
                    ? payload.highlightList.filter((value) => typeof value === "string")
                    : [];
                debugHighlightColor = typeof payload?.highlightColor === "string"
                    ? payload.highlightColor
                    : "red";
                break;
            default:
                break;
        }
    }

    function patchConsole() {
        const consoleMethods = ["log", "debug", "info"];

        for (const methodName of consoleMethods) {
            const originalMethod = window.console?.[methodName];
            if (typeof originalMethod !== "function" || originalMethod.__bunnyPatched) {
                continue;
            }

            const wrappedMethod = function (...args) {
                let shouldSuppressConsoleOutput = false;
                let highlightedOutputHandled = false;
                try {
                    const rendered = buildHighlightedConsoleText(args);
                    highlightedOutputHandled = emitHighlightedConsoleLine(originalMethod, rendered);
                    shouldSuppressConsoleOutput = shouldSuppressConsoleLine(rendered);
                } catch {
                    // ignore console inspection failures
                }

                if (shouldSuppressConsoleOutput || highlightedOutputHandled) {
                    return;
                }

                return originalMethod.apply(this, args);
            };

            Object.defineProperty(wrappedMethod, "__bunnyPatched", {
                value: true,
                configurable: false,
                enumerable: false,
                writable: false,
            });

            window.console[methodName] = wrappedMethod;
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

    patchConsole();
})();
