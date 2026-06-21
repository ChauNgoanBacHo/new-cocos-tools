// electron/main.ts
import { app, BrowserWindow, ipcMain, dialog, screen, protocol, shell } from "electron";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { fileURLToPath, pathToFileURL } from "url";
import { registerEslintHandler } from "./handlers/eslint";
import { registerCodeHealthHandler } from "./handlers/codeHealth";
import { registerCheckConfigHandler } from "./handlers/checkConfig";
import { registerCreateSoundHandler } from "./handlers/createSound";
import { registerCreateAnimHandler } from "./handlers/createAnim";
import { registerBindSoundRefsHandler } from "./handlers/bindSoundRefs";
import { registerCheckAssetsHandler } from "./handlers/checkAssets";
import { registerSpinePreviewHandler } from "./handlers/spinePreview";
import { registerStorageHandlers } from "./storage";
import { registerCheatLocalSocketHandlers } from "./handlers/cheatLocalSocket";
import { registerExportCheatExtensionHandlers } from "./handlers/exportCheatExtension";
import { setupDriveSyncHandlers } from "../src/features/drive-sync/electron-handlers";
import { setupMatrixSyncHandlers } from "../src/features/matrix-sync/electron-handlers";

app.commandLine.appendSwitch("use-mock-keychain");

// Custom scheme so the renderer can fetch() local spine assets — the Fetch API
// (which PixiJS uses to load textures) does not support file:// URLs.
// Must be registered as privileged BEFORE app is ready.
const SPINE_SCHEME = "spine-asset";
protocol.registerSchemesAsPrivileged([
    {
        scheme: SPINE_SCHEME,
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
            bypassCSP: true,
            stream: true,
        },
    },
]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;
const INTERNAL_API_BASE_URL = "https://drive-bot-0ahh.onrender.com";
const INTERNAL_API_KEY = "e22ec2bdcbaf04dd03fd258756ee1f9d7e4d1d627d0512bb03d98dd0e7634b02";

function getAppIconPath() {
    return app.isPackaged
        ? path.join(process.resourcesPath, "assets/icon.png")
        : path.join(app.getAppPath(), "assets/icon.png");
}

function createWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { x, y, width, height } = primaryDisplay.workArea;
    const windowWidth = process.platform === "darwin"
        ? Math.max(1280, Math.floor(width * 0.8))
        : 1280;
    const windowHeight = process.platform === "darwin"
        ? Math.max(860, Math.floor(height * 0.84))
        : 860;

    mainWindow = new BrowserWindow({
        x: x + Math.floor((width - windowWidth) / 2),
        y: y + Math.floor((height - windowHeight) / 2),
        width: windowWidth,
        height: windowHeight,
        minWidth: 1280,
        minHeight: 860,
        icon: getAppIconPath(),
        webPreferences: {
            preload: path.join(__dirname, "preload.mjs"),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false,
        },
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        void shell.openExternal(url);
        return { action: "deny" };
    });

    mainWindow.webContents.on("will-navigate", (event, url) => {
        const currentUrl = mainWindow?.webContents.getURL();
        if (currentUrl && url !== currentUrl) {
            event.preventDefault();
            void shell.openExternal(url);
        }
    });

    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
    }
}

app.whenReady().then(() => {
    // Serve local files over the privileged scheme. The renderer encodes the
    // absolute path as the URL pathname, with a fixed "local" host:
    //   spine-asset://local/<percent-encoded-abs-path>
    protocol.handle(SPINE_SCHEME, async (request) => {
        const cors = { "Access-Control-Allow-Origin": "*" };
        try {
            const url = new URL(request.url);
            // url.pathname starts with "/"; decode back into a real filesystem path.
            const filePath = decodeURIComponent(url.pathname);
            const data = await fs.promises.readFile(filePath);
            // Read raw bytes and hand them back; PixiJS picks its parser by file
            // extension, so an explicit content-type is not required here.
            return new Response(new Uint8Array(data), { status: 200, headers: cors });
        } catch {
            return new Response("Not found", { status: 404, headers: cors });
        }
    });
    createWindow();
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("select-folder", async () => {
    const result = await dialog.showOpenDialog({
        properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
});

ipcMain.handle("select-file", async () => {
    const result = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [{ name: "TypeScript", extensions: ["ts"] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
});

ipcMain.handle("get-app-version", () => app.getVersion());

ipcMain.handle("open-external-link", async (_event, url: string) => {
    try {
        const targetUrl = String(url || "").trim();
        if (!targetUrl) {
            return {
                ok: false,
                error: "URL is required.",
            };
        }

        const opened = await shell.openExternal(targetUrl);
        if (opened === "") {
            return { ok: true };
        }

        return {
            ok: false,
            error: opened,
        };
    } catch (error: unknown) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : "Failed to open external link.",
        };
    }
});

function runDetachedCommand(command: string, args: string[]) {
    return new Promise<void>((resolve, reject) => {
        const child = spawn(command, args, {
            detached: true,
            stdio: "ignore",
        });

        child.once("error", reject);
        child.once("spawn", () => {
            child.unref();
            resolve();
        });
    });
}

ipcMain.handle("open-in-vscode", async (_event, filePath: string, line?: number | null, column?: number | null) => {
    try {
        if (!filePath || !fs.existsSync(filePath)) {
            return {
                ok: false,
                error: "Khong tim thay file de mo trong VS Code.",
            };
        }

        const target = line && column
            ? `${filePath}:${line}:${column}`
            : line
                ? `${filePath}:${line}`
                : filePath;

        try {
            await runDetachedCommand("code", ["-g", target]);
            return { ok: true };
        } catch (primaryError) {
            if (process.platform === "darwin") {
                try {
                    const vscodeUri = `${pathToFileURL(filePath).href.replace("file://", "vscode://file/")}${line ? `:${line}` : ""}${column ? `:${column}` : ""}`;
                    const opened = await shell.openExternal(vscodeUri);
                    if (opened === "") {
                        return { ok: true };
                    }
                } catch {
                    try {
                        await runDetachedCommand("open", ["-a", "Visual Studio Code", filePath, "--args", "-g", target]);
                        return { ok: true };
                    } catch {
                        return {
                            ok: false,
                            error: "Khong mo duoc file trong VS Code. Hay cai lenh Shell Command: Install 'code' command in PATH trong VS Code, hoac dam bao ung dung Visual Studio Code da duoc cai.",
                        };
                    }
                }

                try {
                    await runDetachedCommand("open", ["-a", "Visual Studio Code", filePath]);
                    return { ok: true };
                } catch {
                    return {
                        ok: false,
                        error: "Khong mo duoc file trong VS Code. Hay cai lenh Shell Command: Install 'code' command in PATH trong VS Code, hoac dam bao ung dung Visual Studio Code da duoc cai.",
                    };
                }
            }

            return {
                ok: false,
                error: primaryError instanceof Error
                    ? primaryError.message
                    : "Khong mo duoc VS Code tu app.",
            };
        }
    } catch (error: unknown) {
        return {
            ok: false,
            error: error instanceof Error
                ? error.message
                : "Khong mo duoc VS Code tu app.",
        };
    }
});

registerEslintHandler();
registerCodeHealthHandler();
registerCheckConfigHandler();
registerCreateSoundHandler();
registerCreateAnimHandler();
registerBindSoundRefsHandler();
registerCheckAssetsHandler();
registerSpinePreviewHandler();
registerStorageHandlers();
registerCheatLocalSocketHandlers();
registerExportCheatExtensionHandlers();

setupDriveSyncHandlers(
    INTERNAL_API_BASE_URL,
    INTERNAL_API_KEY,
);

setupMatrixSyncHandlers(
    INTERNAL_API_BASE_URL,
    INTERNAL_API_KEY,
);
