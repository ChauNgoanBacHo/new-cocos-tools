(function () {
    if (window.__ONE_PUNCH_TOOLS_PAGE_HOOK_ACTIVE__) {
        return;
    }
    const BRIDGE_EVENT_TYPE = "ONE_PUNCH_TOOLS_SOCKET_EVENT";
    const PAGE_CONTROL_EVENT_TYPE = "ONE_PUNCH_TOOLS_PAGE_CONTROL";
    const ACCEPTED_EVENT_NAMES = new Set(["n", "f"]);
    const MAX_DEBUG_UNMATCHED_MESSAGES = 5;
    const OVERLAY_ID = "one-punch-devkit-debug-controls";
    const MINI_LOG_ROOT_ID = "one-punch-devkit-mini-log";
    const OVERLAY_POSITION_STORAGE_KEY = "one-punch-devkit-overlay-position";
    const OVERLAY_VIEWPORT_MARGIN = 8;
    let overlayRestoreObserver = null;
    let overlayResizeHandlerBound = false;
    const MINI_LOG_MAX_ENTRIES = 30;
    let unmatchedDebugCount = 0;
    let debugExcludeList = [];
    let debugHighlightList = [];
    let debugHighlightColor = "red";
    let miniLogLines = 5;
    const cheatControlState = {
        configuredSpeed: 1,
        boostEnabled: false,
        paused: false,
        stepFramePending: false,
        overlayVisible: false,
        overlayRoot: null,
        overlayPosition: null,
        miniLogRoot: null,
        overlayPauseButton: null,
        overlaySpeedButton: null,
        overlayNextFrameButton: null,
        overlayResetButton: null,
        overlayMiniLogButton: null,
        overlayMiniLogPanel: null,
        miniLogExpanded: false,
        miniLogEntries: [],
        runtime: null,
        version: null,
        scheduler: null,
        originalTick: null,
        cdpPauseRequested: false,
    };
    const currentScript = document.currentScript;
    const customAllowedOrigins = parseAllowedOrigins(currentScript?.dataset?.allowedOrigins);
    const allowedOrigins = new Set(customAllowedOrigins);

    if (!allowedOrigins.has(window.location.origin)) {
        return;
    }

    window.__ONE_PUNCH_TOOLS_PAGE_HOOK_ACTIVE__ = true;

    function emitBridgeEvent(payload) {
        window.postMessage({
            source: BRIDGE_EVENT_TYPE,
            ...payload,
        }, "*");
    }

    function emitDebugEvent(debugType, payload) {
        emitBridgeEvent({
            debugType,
            payload,
        });
    }

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

    function appendMiniLogEntry(message, options = {}) {
        if (typeof message !== "string" || !message.trim()) {
            return;
        }

        const normalizedMessage = message.trim();
        if (shouldSuppressConsoleLine(normalizedMessage)) {
            return;
        }
        const shouldFilterByHighlight = debugHighlightList.length > 0;
        const isHighlighted = matchesHighlightRule(normalizedMessage);

        if (shouldFilterByHighlight && !isHighlighted) {
            return;
        }

        const entry = {
            text: normalizedMessage.slice(0, 280),
            color: typeof options.color === "string" ? options.color : isHighlighted ? debugHighlightColor : null,
        };

        cheatControlState.miniLogEntries = [...cheatControlState.miniLogEntries.slice(-(MINI_LOG_MAX_ENTRIES - 1)), entry];
        renderMiniLogEntries();
    }

    function appendErrorMiniLogEntry(message) {
        if (typeof message !== "string" || !message.trim()) {
            return;
        }

        const entry = {
            text: `⛔ ${message.trim()}`.slice(0, 280),
            color: null,
            isError: true,
        };

        cheatControlState.miniLogEntries = [...cheatControlState.miniLogEntries.slice(-(MINI_LOG_MAX_ENTRIES - 1)), entry];
        renderMiniLogEntries();
    }

    function reportRuntimeError(message) {
        if (!cheatControlState.overlayVisible) {
            return;
        }

        appendErrorMiniLogEntry(message);

        if (!cheatControlState.cdpPauseRequested) {
            cheatControlState.cdpPauseRequested = true;
            appendErrorMiniLogEntry("Freezing scene via debugger... Resume from the extension popup.");
            window.postMessage({
                source: BRIDGE_EVENT_TYPE,
                cdpControl: "pause-on-error",
            }, "*");
        }
    }

    function getMiniLogPanelHeightPx(lineCount) {
        const safeLineCount = Math.min(30, Math.max(1, Number.isFinite(Number(lineCount)) ? Number(lineCount) : 5));
        return safeLineCount * 28 + 16;
    }

    function renderMiniLogEntries() {
        if (!cheatControlState.overlayMiniLogPanel) {
            return;
        }

        cheatControlState.overlayMiniLogPanel.innerHTML = "";

        if (cheatControlState.miniLogEntries.length === 0) {
            const emptyState = document.createElement("div");
            emptyState.textContent = debugHighlightList.length > 0
                ? "No matching highlight logs yet."
                : "Refresh page to start mini log capture.";
            emptyState.style.color = "#f8fafc";
            emptyState.style.fontSize = "11px";
            emptyState.style.lineHeight = "1.45";
            cheatControlState.overlayMiniLogPanel.appendChild(emptyState);
            return;
        }

        cheatControlState.miniLogEntries.forEach((entry, index) => {
            const line = document.createElement("div");
            line.textContent = entry.text;
            line.style.fontSize = "11px";
            line.style.lineHeight = "1.6";
            line.style.whiteSpace = "nowrap";
            line.style.overflow = "hidden";
            line.style.textOverflow = "ellipsis";
            line.style.padding = "4px 8px";
            line.style.marginBottom = "0";
            line.style.borderRadius = "0";
            line.style.userSelect = "text";
            line.style.webkitUserSelect = "text";
            line.style.cursor = "text";
            line.style.borderBottom = index === cheatControlState.miniLogEntries.length - 1
                ? "none"
                : "1px solid rgba(255, 255, 255, 0.08)";
            if (entry.isError) {
                line.style.color = "#fecaca";
                line.style.background = "rgba(220, 38, 38, 0.22)";
                line.style.fontWeight = "700";
                line.style.whiteSpace = "normal";
            } else {
                line.style.color = entry.color
                    ? entry.color === "amber"
                        ? "#facc15"
                        : entry.color === "cyan"
                            ? "#c084fc"
                            : "#ff4d6d"
                    : "#f8fafc";
            }
            cheatControlState.overlayMiniLogPanel.appendChild(line);
        });

        cheatControlState.overlayMiniLogPanel.scrollTop = cheatControlState.overlayMiniLogPanel.scrollHeight;
    }

    function emitHighlightedConsoleLine(originalMethod, rendered) {
        const highlightMeta = getHighlightMeta(rendered);
        if (!highlightMeta) {
            return false;
        }

        const highlightStyle = getConsoleHighlightStyle(highlightMeta.color);
        appendMiniLogEntry(rendered, { color: highlightMeta.color });
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

    function syncMiniLogPosition() {
        const root = cheatControlState.overlayRoot;
        const miniLogRoot = cheatControlState.miniLogRoot;
        if (!root || !miniLogRoot) {
            return;
        }
        const rect = root.getBoundingClientRect();
        miniLogRoot.style.left = "auto";
        miniLogRoot.style.right = `${Math.max(OVERLAY_VIEWPORT_MARGIN, window.innerWidth - rect.right)}px`;
        miniLogRoot.style.top = `${rect.bottom + 6}px`;
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
        syncMiniLogPosition();
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

        function onPointerUp(event) {
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
        document.getElementById(MINI_LOG_ROOT_ID)?.remove();

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

        const miniLogButton = createIconButton();
        miniLogButton.addEventListener("click", () => {
            cheatControlState.miniLogExpanded = !cheatControlState.miniLogExpanded;
            updateOverlayUi();
        });

        const miniLogRoot = document.createElement("div");
        miniLogRoot.id = MINI_LOG_ROOT_ID;
        miniLogRoot.style.position = "fixed";
        miniLogRoot.style.top = "54px";
        miniLogRoot.style.right = "16px";
        miniLogRoot.style.zIndex = "2147483646";
        miniLogRoot.style.display = "none";
        miniLogRoot.style.padding = "0";
        miniLogRoot.style.fontFamily = "Arial, sans-serif";

        const miniLogPanel = document.createElement("div");
        miniLogPanel.style.padding = "10px";
        miniLogPanel.style.width = "336px";
        miniLogPanel.style.maxWidth = "336px";
        miniLogPanel.style.maxHeight = `${getMiniLogPanelHeightPx(miniLogLines)}px`;
        miniLogPanel.style.overflowY = "auto";
        miniLogPanel.style.borderRadius = "12px";
        miniLogPanel.style.background = "rgba(39, 39, 42, 0.98)";
        miniLogPanel.style.border = "1px solid rgba(255, 255, 255, 0.08)";
        miniLogPanel.style.boxShadow = "0 16px 30px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255,255,255,0.04)";
        miniLogPanel.style.fontFamily = "Arial, sans-serif";
        miniLogPanel.style.color = "#f8fafc";
        miniLogPanel.style.userSelect = "text";
        miniLogPanel.style.webkitUserSelect = "text";
        miniLogPanel.style.cursor = "text";

        root.appendChild(dragHandle);
        root.appendChild(pauseButton);
        root.appendChild(nextFrameButton);
        root.appendChild(speedButton);
        root.appendChild(resetButton);
        root.appendChild(miniLogButton);
        miniLogRoot.appendChild(miniLogPanel);
        (document.body || document.documentElement).appendChild(root);
        (document.body || document.documentElement).appendChild(miniLogRoot);

        cheatControlState.overlayRoot = root;
        cheatControlState.miniLogRoot = miniLogRoot;
        cheatControlState.overlayPauseButton = pauseButton;
        cheatControlState.overlaySpeedButton = speedButton;
        cheatControlState.overlayNextFrameButton = nextFrameButton;
        cheatControlState.overlayResetButton = resetButton;
        cheatControlState.overlayMiniLogButton = miniLogButton;
        cheatControlState.overlayMiniLogPanel = miniLogPanel;

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

        renderMiniLogEntries();
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

            const overlayMissing = !document.getElementById(OVERLAY_ID);
            const miniLogMissing = cheatControlState.miniLogExpanded && !document.getElementById(MINI_LOG_ROOT_ID);

            if (overlayMissing || miniLogMissing) {
                cheatControlState.overlayRoot = null;
                cheatControlState.miniLogRoot = null;
                cheatControlState.overlayPauseButton = null;
                cheatControlState.overlaySpeedButton = null;
                cheatControlState.overlayNextFrameButton = null;
                cheatControlState.overlayResetButton = null;
                cheatControlState.overlayMiniLogButton = null;
                cheatControlState.overlayMiniLogPanel = null;
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
            || !cheatControlState.miniLogRoot
            || !cheatControlState.overlayPauseButton
            || !cheatControlState.overlaySpeedButton
            || !cheatControlState.overlayNextFrameButton
            || !cheatControlState.overlayResetButton
            || !cheatControlState.overlayMiniLogButton
            || !cheatControlState.overlayMiniLogPanel
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

        cheatControlState.overlayMiniLogButton.textContent = "☰";
        cheatControlState.overlayMiniLogButton.title = cheatControlState.miniLogExpanded ? "Hide mini log" : "Show mini log";
        cheatControlState.overlayMiniLogButton.style.background = cheatControlState.miniLogExpanded ? "#0f766e" : "#334155";

        if (cheatControlState.miniLogRoot) {
            cheatControlState.miniLogRoot.style.display = cheatControlState.miniLogExpanded ? "block" : "none";
            if (cheatControlState.miniLogExpanded && cheatControlState.overlayPosition) {
                syncMiniLogPosition();
            }
        }
    }

    function setOverlayVisibility(enabled) {
        cheatControlState.overlayVisible = enabled === true;
        if (!cheatControlState.overlayVisible) {
            if (cheatControlState.overlayRoot) {
                cheatControlState.overlayRoot.style.display = "none";
            }
            if (cheatControlState.miniLogRoot) {
                cheatControlState.miniLogRoot.style.display = "none";
            }
            return;
        }

        ensureOverlayRestoreObserver();
        ensureOverlay();
        renderMiniLogEntries();
        updateOverlayUi();
    }

    function handlePageControl(command, payload) {
        switch (command) {
            case "set-speed":
                setCheatSpeed(payload?.speed);
                break;
            case "cdp-resumed":
                cheatControlState.cdpPauseRequested = false;
                appendErrorMiniLogEntry("Scene resumed.");
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
                miniLogLines = typeof payload?.miniLogLines === "number"
                    ? Math.min(30, Math.max(1, payload.miniLogLines))
                    : 5;
                if (cheatControlState.overlayMiniLogPanel) {
                    cheatControlState.overlayMiniLogPanel.style.maxHeight = `${getMiniLogPanelHeightPx(miniLogLines)}px`;
                }
                renderMiniLogEntries();
                break;
            default:
                break;
        }
    }

    function normalizeSocketPayload(rawPayload, socketUrl) {
        const candidate = unwrapSocketEnvelope(rawPayload);

        if (!candidate || typeof candidate !== "object") {
            return null;
        }

        const data = candidate.da && typeof candidate.da === "object" ? candidate.da : candidate;
        const serviceId = typeof data.sid === "string"
            ? data.sid
            : typeof data.sId === "string"
                ? data.sId
                : extractGameIdFromPath(window.location.pathname);
        const eventName = typeof data.ev === "string"
            ? data.ev
            : typeof data.event === "string"
                ? data.event
                : null;
        const eventId = typeof data.eid === "string" ? data.eid : null;
        const innerData = data.da && typeof data.da === "object" ? data.da : data;

        if (!eventName || !ACCEPTED_EVENT_NAMES.has(eventName)) {
            return null;
        }

        return {
            eventName,
            gameId: serviceId,
            payload: {
                url: socketUrl,
                serviceId,
                eventId,
                data: innerData,
                raw: rawPayload,
            },
        };
    }

    async function normalizeSocketPayloadFromEventData(rawEventData, socketUrl) {
        if (typeof rawEventData === "string") {
            return normalizeSocketPayload(tryParseJsonCandidate(rawEventData) ?? rawEventData, socketUrl);
        }

        if (rawEventData instanceof Blob) {
            try {
                const text = await rawEventData.text();
                return normalizeSocketPayload(tryParseJsonCandidate(text) ?? text, socketUrl);
            } catch {
                return null;
            }
        }

        if (rawEventData instanceof ArrayBuffer) {
            try {
                const text = new TextDecoder().decode(new Uint8Array(rawEventData));
                return normalizeSocketPayload(tryParseJsonCandidate(text) ?? text, socketUrl);
            } catch {
                return null;
            }
        }

        if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView && ArrayBuffer.isView(rawEventData)) {
            try {
                const text = new TextDecoder().decode(rawEventData);
                return normalizeSocketPayload(tryParseJsonCandidate(text) ?? text, socketUrl);
            } catch {
                return null;
            }
        }

        return normalizeSocketPayload(rawEventData, socketUrl);
    }

    function unwrapSocketEnvelope(payload) {
        if (typeof payload === "string") {
            const normalizedText = stripSocketIoPrefix(payload);
            if (normalizedText !== payload) {
                return unwrapSocketEnvelope(normalizedText);
            }

            const nestedStringPayload = tryParseJsonCandidate(payload);
            if (typeof nestedStringPayload === "string" && nestedStringPayload !== payload) {
                return unwrapSocketEnvelope(nestedStringPayload);
            }
        }

        if (typeof payload === "object" && payload !== null) {
            return payload;
        }

        if (typeof payload !== "string") {
            return null;
        }

        const text = payload.trim();
        const candidates = [text];

        const objectStart = text.indexOf("{");
        if (objectStart >= 0) {
            candidates.push(text.slice(objectStart));
        }

        const bracketStart = text.indexOf("[");
        if (bracketStart >= 0) {
            candidates.push(text.slice(bracketStart));
        }

        for (const candidate of candidates) {
            const parsed = tryParseJsonCandidate(candidate);
            if (!parsed) {
                continue;
            }

            if (typeof parsed === "string") {
                const nested = tryParseJsonCandidate(parsed);
                if (nested) {
                    return nested;
                }
            }

            if (Array.isArray(parsed) && parsed.length > 0) {
                const extractedFromArray = extractCandidateFromArray(parsed);
                if (extractedFromArray) {
                    return extractedFromArray;
                }

                for (const item of parsed) {
                    if (typeof item === "string") {
                        const nested = tryParseJsonCandidate(item);
                        if (nested) {
                            return nested;
                        }
                    }

                    if (typeof item === "object" && item !== null) {
                        return item;
                    }
                }
            }

            if (typeof parsed === "object" && parsed !== null) {
                return parsed;
            }
        }

        return null;
    }

    function extractCandidateFromArray(values) {
        for (const item of values) {
            if (typeof item === "string") {
                const normalizedText = stripSocketIoPrefix(item);
                if (normalizedText !== item) {
                    const nestedFromSocketIo = unwrapSocketEnvelope(normalizedText);
                    if (nestedFromSocketIo) {
                        return nestedFromSocketIo;
                    }
                }

                const nested = tryParseJsonCandidate(item);
                if (nested) {
                    const unwrappedNested = unwrapSocketEnvelope(nested);
                    if (unwrappedNested) {
                        return unwrappedNested;
                    }
                }
            }

            if (Array.isArray(item)) {
                const nestedFromArray = extractCandidateFromArray(item);
                if (nestedFromArray) {
                    return nestedFromArray;
                }
            }

            if (item && typeof item === "object") {
                if (looksLikeGamePayload(item)) {
                    return item;
                }

                const values = Object.values(item);
                const nestedFromObjectValues = extractCandidateFromArray(values);
                if (nestedFromObjectValues) {
                    return nestedFromObjectValues;
                }
            }
        }

        return null;
    }

    function looksLikeGamePayload(candidate) {
        if (!candidate || typeof candidate !== "object") {
            return false;
        }

        if (typeof candidate.ev === "string" || typeof candidate.event === "string") {
            return true;
        }

        if (candidate.da && typeof candidate.da === "object") {
            const nested = candidate.da;
            return typeof nested.ev === "string"
                || typeof nested.event === "string"
                || typeof nested.sid === "string"
                || typeof nested.sId === "string";
        }

        return typeof candidate.sid === "string" || typeof candidate.sId === "string";
    }

    function stripSocketIoPrefix(value) {
        if (typeof value !== "string") {
            return value;
        }

        const text = value.trim();
        const jsonStart = findJsonStartIndex(text);
        if (jsonStart <= 0) {
            return value;
        }

        const prefix = text.slice(0, jsonStart);
        if (/^[0-9A-Za-z:-]+$/.test(prefix)) {
            return text.slice(jsonStart);
        }

        return value;
    }

    function findJsonStartIndex(text) {
        const arrayStart = text.indexOf("[");
        const objectStart = text.indexOf("{");

        if (arrayStart < 0) {
            return objectStart;
        }

        if (objectStart < 0) {
            return arrayStart;
        }

        return Math.min(arrayStart, objectStart);
    }

    function tryParseJsonCandidate(candidate) {
        try {
            return JSON.parse(candidate);
        } catch {
            return null;
        }
    }

    function patchWebSocket() {
        const NativeWebSocket = window.WebSocket;
        if (!NativeWebSocket || NativeWebSocket.__onePunchDevKitPatched) {
            return;
        }

        function WrappedWebSocket(...args) {
            const socket = new NativeWebSocket(...args);

            socket.addEventListener("message", async (event) => {
                const normalizedPayload = await normalizeSocketPayloadFromEventData(event.data, socket.url);
                if (normalizedPayload) {
                    emitBridgeEvent(normalizedPayload);
                    return;
                }

                if (unmatchedDebugCount < MAX_DEBUG_UNMATCHED_MESSAGES) {
                    const preview = await getDebugPreview(event.data);
                    unmatchedDebugCount += 1;
                    emitDebugEvent("socket-message-unmatched", {
                        url: socket.url,
                        dataType: typeof event.data,
                        preview,
                        highlight: getHighlightMeta(preview),
                    });
                }
            });

            return socket;
        }

        WrappedWebSocket.prototype = NativeWebSocket.prototype;
        Object.defineProperty(WrappedWebSocket, "__onePunchDevKitPatched", {
            value: true,
            configurable: false,
            enumerable: false,
            writable: false,
        });

        window.WebSocket = WrappedWebSocket;
    }

    function patchConsole() {
        const consoleMethods = ["log", "debug", "info"];

        for (const methodName of consoleMethods) {
            const originalMethod = window.console?.[methodName];
            if (typeof originalMethod !== "function" || originalMethod.__onePunchDevKitPatched) {
                continue;
            }

            const wrappedMethod = function (...args) {
                let shouldSuppressConsoleOutput = false;
                let highlightedOutputHandled = false;
                try {
                    const rendered = buildHighlightedConsoleText(args);
                    highlightedOutputHandled = emitHighlightedConsoleLine(originalMethod, rendered);
                    shouldSuppressConsoleOutput = shouldSuppressConsoleLine(rendered) || inspectConsoleArgs(args);
                    if (!highlightedOutputHandled && !shouldSuppressConsoleOutput) {
                        appendMiniLogEntry(rendered);
                    }
                } catch {
                    // ignore console inspection failures
                }

                if (shouldSuppressConsoleOutput || highlightedOutputHandled) {
                    return;
                }

                return originalMethod.apply(this, args);
            };

            Object.defineProperty(wrappedMethod, "__onePunchDevKitPatched", {
                value: true,
                configurable: false,
                enumerable: false,
                writable: false,
            });

            window.console[methodName] = wrappedMethod;
        }

        patchConsoleError();
    }

    function patchConsoleError() {
        const originalError = window.console?.error;
        if (typeof originalError !== "function" || originalError.__onePunchDevKitPatched) {
            return;
        }

        const wrappedError = function (...args) {
            try {
                const rendered = buildHighlightedConsoleText(args);
                reportRuntimeError(rendered);
            } catch {
                // ignore console inspection failures
            }

            return originalError.apply(this, args);
        };

        Object.defineProperty(wrappedError, "__onePunchDevKitPatched", {
            value: true,
            configurable: false,
            enumerable: false,
            writable: false,
        });

        window.console.error = wrappedError;
    }

    function inspectConsoleArgs(args) {
        if (!Array.isArray(args) || args.length === 0) {
            return false;
        }

        const firstArg = typeof args[0] === "string" ? args[0] : "";
        const joined = args
            .map((arg) => {
                if (typeof arg === "string") {
                    return arg;
                }

                try {
                    return JSON.stringify(arg);
                } catch {
                    return String(arg);
                }
            })
            .join(" ");

        const isSocketLog = firstArg.includes("SocketManagerNewMessage") || joined.includes("SocketManagerNewMessage");
        const isEventManagerLog = firstArg.includes("EventManager - newEvent") || joined.includes("EventManager - newEvent");
        const highlightMeta = getHighlightMeta(joined);

        if (!isSocketLog && !isEventManagerLog) {
            if (highlightMeta) {
                emitDebugEvent("console-highlight", {
                    preview: joined.slice(0, 220),
                    highlight: highlightMeta,
                });
            }
            return false;
        }

        const candidate = extractJsonLikeSubstring(joined);
        if (!candidate) {
            emitDebugEvent("console-message-unmatched", {
                preview: joined.slice(0, 220),
                highlight: highlightMeta,
            });
            return false;
        }

        const normalizedPayload = normalizeSocketPayload(candidate, "console-bridge");
        if (normalizedPayload) {
            emitBridgeEvent(normalizedPayload);
            return true;
        }

        emitDebugEvent("console-message-unmatched", {
            preview: joined.slice(0, 220),
            highlight: highlightMeta,
        });
        return false;
    }

    function extractJsonLikeSubstring(text) {
        if (typeof text !== "string") {
            return null;
        }

        const arrayStart = text.indexOf("[");
        const objectStart = text.indexOf("{");
        let startIndex = -1;

        if (arrayStart >= 0 && objectStart >= 0) {
            startIndex = Math.min(arrayStart, objectStart);
        } else if (arrayStart >= 0) {
            startIndex = arrayStart;
        } else if (objectStart >= 0) {
            startIndex = objectStart;
        }

        if (startIndex < 0) {
            return null;
        }

        return text.slice(startIndex).trim();
    }

    function extractGameIdFromPath(pathname) {
        const match = pathname.match(/kts(\d+)/i);
        return match ? match[1] : null;
    }

    async function getDebugPreview(eventData) {
        if (typeof eventData === "string") {
            return eventData.slice(0, 220);
        }

        if (eventData instanceof Blob) {
            try {
                const text = await eventData.text();
                return `[blob] ${text.slice(0, 220)}`;
            } catch {
                return "[blob]";
            }
        }

        if (eventData instanceof ArrayBuffer) {
            try {
                const text = new TextDecoder().decode(new Uint8Array(eventData));
                return `[arraybuffer] ${text.slice(0, 220)}`;
            } catch {
                return "[arraybuffer]";
            }
        }

        if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView && ArrayBuffer.isView(eventData)) {
            try {
                const text = new TextDecoder().decode(eventData);
                return `[typedarray] ${text.slice(0, 220)}`;
            } catch {
                return "[typedarray]";
            }
        }

        return Object.prototype.toString.call(eventData);
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

    window.addEventListener("error", (event) => {
        const message = event?.message
            || (event?.error && event.error.stack)
            || (event?.error && String(event.error))
            || "Uncaught error";
        const location = event?.filename
            ? ` (${event.filename}:${event.lineno ?? "?"})`
            : "";
        reportRuntimeError(`${message}${location}`);
    });

    window.addEventListener("unhandledrejection", (event) => {
        const reason = event?.reason;
        const message = reason && reason.stack
            ? reason.stack
            : reason && reason.message
                ? reason.message
                : String(reason ?? "Unhandled promise rejection");
        reportRuntimeError(`Unhandled rejection: ${message}`);
    });

    patchWebSocket();
    patchConsole();
    emitDebugEvent("page-hook-ready", {
        origin: window.location.origin,
        path: window.location.pathname,
    });
})();
