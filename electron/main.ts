// electron/main.ts
import { app, BrowserWindow, ipcMain, dialog, screen, protocol } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { registerEslintHandler } from "./handlers/eslint";
import { registerCheckConfigHandler } from "./handlers/checkConfig";
import { registerCreateSoundHandler } from "./handlers/createSound";
import { registerCreateAnimHandler } from "./handlers/createAnim";
import { registerBindSoundRefsHandler } from "./handlers/bindSoundRefs";
import { registerCheckAssetsHandler } from "./handlers/checkAssets";
import { registerSpinePreviewHandler } from "./handlers/spinePreview";
import { setupDriveSyncHandlers } from "../src/features/drive-sync/electron-handlers";

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

function getAppIconPath() {
    return app.isPackaged
        ? path.join(process.resourcesPath, "assets/icon.png")
        : path.join(app.getAppPath(), "assets/icon.png");
}

function createWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { x, y, width, height } = primaryDisplay.workArea;
    const windowWidth = 1280;
    const windowHeight = 860;

    mainWindow = new BrowserWindow({
        x: x + Math.floor((width - windowWidth) / 2),
        y: y + Math.floor((height - windowHeight) / 2),
        width: windowWidth,
        height: windowHeight,
        icon: getAppIconPath(),
        webPreferences: {
            preload: path.join(__dirname, "preload.mjs"),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false,
        },
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

registerEslintHandler();
registerCheckConfigHandler();
registerCreateSoundHandler();
registerCreateAnimHandler();
registerBindSoundRefsHandler();
registerCheckAssetsHandler();
registerSpinePreviewHandler();

setupDriveSyncHandlers(
    'https://drive-bot-0ahh.onrender.com',
    'e22ec2bdcbaf04dd03fd258756ee1f9d7e4d1d627d0512bb03d98dd0e7634b02'
);
