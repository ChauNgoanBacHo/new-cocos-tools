import { BrowserWindow, ipcMain, webContents } from "electron";
import crypto from "crypto";
import http from "http";
import net from "net";

interface CheatSocketEventMessage {
    type: string;
    [key: string]: unknown;
}

interface CheatLocalSocketStatus {
    enabled: boolean;
    running: boolean;
    host: string;
    port: number;
    clientCount: number;
    lastEventAt: number | null;
    lastEventType: string | null;
    lastError: string | null;
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 17381;
const STATUS_CHANNEL = "cheat-local-socket:status";
const EVENT_CHANNEL = "cheat-local-socket:event";

let server: http.Server | null = null;
const clients = new Set<net.Socket>();
const status: CheatLocalSocketStatus = {
    enabled: false,
    running: false,
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    clientCount: 0,
    lastEventAt: null,
    lastEventType: null,
    lastError: null,
};

function cloneStatus(): CheatLocalSocketStatus {
    return { ...status };
}

function broadcast(channel: string, payload: unknown) {
    for (const contents of webContents.getAllWebContents()) {
        if (!contents.isDestroyed()) {
            contents.send(channel, payload);
        }
    }
}

function notifyStatus() {
    broadcast(STATUS_CHANNEL, cloneStatus());
}

function updateClientCount() {
    status.clientCount = clients.size;
    notifyStatus();
}

function isTextFrame(opcode: number) {
    return opcode === 0x1;
}

function decodeWebSocketFrames(buffer: Buffer) {
    const messages: string[] = [];
    let offset = 0;

    while (offset + 2 <= buffer.length) {
        const firstByte = buffer[offset];
        const secondByte = buffer[offset + 1];
        const opcode = firstByte & 0x0f;
        const masked = (secondByte & 0x80) !== 0;
        let payloadLength = secondByte & 0x7f;
        let headerLength = 2;

        if (payloadLength === 126) {
            if (offset + 4 > buffer.length) break;
            payloadLength = buffer.readUInt16BE(offset + 2);
            headerLength = 4;
        } else if (payloadLength === 127) {
            if (offset + 10 > buffer.length) break;
            const bigLength = buffer.readBigUInt64BE(offset + 2);
            if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
                throw new Error("WebSocket payload too large");
            }
            payloadLength = Number(bigLength);
            headerLength = 10;
        }

        const maskLength = masked ? 4 : 0;
        const frameLength = headerLength + maskLength + payloadLength;
        if (offset + frameLength > buffer.length) break;

        const payloadStart = offset + headerLength + maskLength;
        const payload = buffer.subarray(payloadStart, payloadStart + payloadLength);

        if (opcode === 0x8) {
            offset += frameLength;
            continue;
        }

        if (isTextFrame(opcode)) {
            if (masked) {
                const mask = buffer.subarray(offset + headerLength, offset + headerLength + 4);
                const decoded = Buffer.alloc(payloadLength);
                for (let index = 0; index < payloadLength; index += 1) {
                    decoded[index] = payload[index] ^ mask[index % 4];
                }
                messages.push(decoded.toString("utf8"));
            } else {
                messages.push(payload.toString("utf8"));
            }
        }

        offset += frameLength;
    }

    return {
        messages,
        remaining: buffer.subarray(offset),
    };
}

function handleClientMessage(rawMessage: string) {
    try {
        const parsed = JSON.parse(rawMessage) as CheatSocketEventMessage;
        status.lastEventAt = Date.now();
        status.lastEventType = typeof parsed.type === "string" ? parsed.type : "unknown";
        status.lastError = null;
        notifyStatus();
        broadcast(EVENT_CHANNEL, parsed);
    } catch (error) {
        status.lastError = error instanceof Error ? error.message : "Invalid socket payload";
        notifyStatus();
    }
}

function setupSocketConnection(socket: net.Socket) {
    clients.add(socket);
    updateClientCount();

    let frameBuffer = Buffer.alloc(0);

    socket.on("data", (chunk: Buffer) => {
        try {
            frameBuffer = Buffer.concat([frameBuffer, chunk]);
            const decoded = decodeWebSocketFrames(frameBuffer);
            frameBuffer = decoded.remaining;
            for (const message of decoded.messages) {
                handleClientMessage(message);
            }
        } catch (error) {
            status.lastError = error instanceof Error ? error.message : "WebSocket decode error";
            notifyStatus();
        }
    });

    const cleanup = () => {
        clients.delete(socket);
        updateClientCount();
    };

    socket.on("close", cleanup);
    socket.on("end", cleanup);
    socket.on("error", () => cleanup());
}

function createWebSocketAcceptValue(key: string) {
    return crypto
        .createHash("sha1")
        .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`, "binary")
        .digest("base64");
}

async function startServer(port = DEFAULT_PORT) {
    if (server) {
        status.enabled = true;
        status.running = true;
        status.port = port;
        notifyStatus();
        return cloneStatus();
    }

    await new Promise<void>((resolve, reject) => {
        const nextServer = http.createServer();

        nextServer.on("upgrade", (request, socket) => {
            const upgradeHeader = request.headers.upgrade;
            const socketKey = request.headers["sec-websocket-key"];

            if (upgradeHeader !== "websocket" || typeof socketKey !== "string") {
                socket.destroy();
                return;
            }

            const acceptValue = createWebSocketAcceptValue(socketKey);
            socket.write(
                [
                    "HTTP/1.1 101 Switching Protocols",
                    "Upgrade: websocket",
                    "Connection: Upgrade",
                    `Sec-WebSocket-Accept: ${acceptValue}`,
                    "",
                    "",
                ].join("\r\n"),
            );

            setupSocketConnection(socket);
        });

        nextServer.on("error", (error) => {
            status.lastError = error instanceof Error ? error.message : "Local socket server error";
            status.running = false;
            notifyStatus();
            reject(error);
        });

        nextServer.listen(port, DEFAULT_HOST, () => {
            server = nextServer;
            status.enabled = true;
            status.running = true;
            status.host = DEFAULT_HOST;
            status.port = port;
            status.lastError = null;
            notifyStatus();
            resolve();
        });
    });

    return cloneStatus();
}

async function stopServer() {
    status.enabled = false;

    if (!server) {
        status.running = false;
        status.clientCount = 0;
        notifyStatus();
        return cloneStatus();
    }

    for (const client of clients) {
        client.destroy();
    }
    clients.clear();

    await new Promise<void>((resolve, reject) => {
        server?.close((error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });

    server = null;
    status.running = false;
    status.clientCount = 0;
    notifyStatus();

    return cloneStatus();
}

export function registerCheatLocalSocketHandlers() {
    ipcMain.handle("cheat-local-socket:start", async (_event, port?: number) => startServer(port));
    ipcMain.handle("cheat-local-socket:stop", async () => stopServer());
    ipcMain.handle("cheat-local-socket:status", () => cloneStatus());
    ipcMain.handle("cheat-local-socket:emit-test", (_event, payload?: Record<string, unknown>) => {
        const message = {
            type: "test-event",
            timestamp: Date.now(),
            ...payload,
        };
        status.lastEventAt = Date.now();
        status.lastEventType = message.type;
        status.lastError = null;
        notifyStatus();
        broadcast(EVENT_CHANNEL, message);
        return { ok: true };
    });
}

export type { CheatLocalSocketStatus };

