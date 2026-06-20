(function () {
    const BRIDGE_EVENT_TYPE = "ONE_PUNCH_TOOLS_SOCKET_EVENT";
    const ACCEPTED_EVENT_NAMES = new Set(["n", "f"]);
    const DEFAULT_ALLOWED_ORIGINS = [
        "http://localhost:7456",
        "https://iframe-tektale.staging.enostd.gay",
        "https://webapp5tek.enostd.gay",
    ];
    const MAX_DEBUG_UNMATCHED_MESSAGES = 5;
    let unmatchedDebugCount = 0;
    const currentScript = document.currentScript;
    const customAllowedOrigins = parseAllowedOrigins(currentScript?.dataset?.allowedOrigins);
    const allowedOrigins = new Set([...DEFAULT_ALLOWED_ORIGINS, ...customAllowedOrigins]);

    if (!allowedOrigins.has(window.location.origin)) {
        return;
    }

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
        if (!NativeWebSocket || NativeWebSocket.__onePunchToolsPatched) {
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
                    unmatchedDebugCount += 1;
                    emitDebugEvent("socket-message-unmatched", {
                        url: socket.url,
                        dataType: typeof event.data,
                        preview: await getDebugPreview(event.data),
                    });
                }
            });

            return socket;
        }

        WrappedWebSocket.prototype = NativeWebSocket.prototype;
        Object.defineProperty(WrappedWebSocket, "__onePunchToolsPatched", {
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
            if (typeof originalMethod !== "function" || originalMethod.__onePunchToolsPatched) {
                continue;
            }

            const wrappedMethod = function (...args) {
                try {
                    inspectConsoleArgs(args);
                } catch {
                    // ignore console inspection failures
                }

                return originalMethod.apply(this, args);
            };

            Object.defineProperty(wrappedMethod, "__onePunchToolsPatched", {
                value: true,
                configurable: false,
                enumerable: false,
                writable: false,
            });

            window.console[methodName] = wrappedMethod;
        }
    }

    function inspectConsoleArgs(args) {
        if (!Array.isArray(args) || args.length === 0) {
            return;
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

        if (!isSocketLog && !isEventManagerLog) {
            return;
        }

        const candidate = extractJsonLikeSubstring(joined);
        if (!candidate) {
            emitDebugEvent("console-message-unmatched", {
                preview: joined.slice(0, 220),
            });
            return;
        }

        const normalizedPayload = normalizeSocketPayload(candidate, "console-bridge");
        if (normalizedPayload) {
            emitBridgeEvent(normalizedPayload);
            return;
        }

        emitDebugEvent("console-message-unmatched", {
            preview: joined.slice(0, 220),
        });
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

    patchWebSocket();
    patchConsole();
    emitDebugEvent("page-hook-ready", {
        origin: window.location.origin,
        path: window.location.pathname,
    });
})();
