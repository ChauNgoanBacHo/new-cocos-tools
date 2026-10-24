import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "../..");
const iconPath = path.join(projectRoot, "assets", "icon.png");
const appHtmlPath = path.join(projectRoot, "dist-spine-metadata", "index.html");
const preloadPath = path.join(currentDir, "preload.cjs");
const spineFilePattern = /\.(json|skel|atlas|png|webp|jpe?g)$/i;

async function collectSpineFiles(rootPath, directoryPath = rootPath) {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const absolutePath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
            files.push(...await collectSpineFiles(rootPath, absolutePath));
        } else if (entry.isFile() && spineFilePattern.test(entry.name)) {
            files.push({
                name: entry.name,
                relativePath: path.relative(rootPath, absolutePath).split(path.sep).join("/"),
                data: await fs.readFile(absolutePath),
            });
        }
    }

    return files;
}

async function readSpineFolder(rootPath) {
    const stats = await fs.stat(rootPath);
    if (!stats.isDirectory()) throw new Error("The saved Spine path is not a folder.");
    return {
        canceled: false,
        folderName: path.basename(rootPath),
        folderPath: rootPath,
        files: await collectSpineFiles(rootPath),
    };
}

ipcMain.handle("spine-notes:select-folder", async () => {
    const result = await dialog.showOpenDialog({
        title: "Choose Spine folder",
        properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) {
        return { canceled: true, files: [] };
    }

    const rootPath = result.filePaths[0];
    return readSpineFolder(rootPath);
});

ipcMain.handle("spine-notes:scan-folder", async (_event, folderPath) => {
    if (typeof folderPath !== "string" || !path.isAbsolute(folderPath)) {
        throw new Error("The saved Spine folder path is invalid.");
    }
    return readSpineFolder(folderPath);
});

function createWindow() {
    const window = new BrowserWindow({
        width: 1480,
        height: 940,
        minWidth: 1100,
        minHeight: 720,
        show: false,
        title: "Spine Notes",
        icon: iconPath,
        backgroundColor: "#090d14",
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: false,
        },
    });

    window.once("ready-to-show", () => window.show());
    if (process.env.ELECTRON_ENABLE_LOGGING) {
        window.webContents.on("console-message", (_event, level, message) => {
            console.log(`[renderer:${level}] ${message}`);
        });
        window.webContents.on("did-fail-load", (_event, code, description, url) => {
            console.error(`[renderer-load:${code}] ${description} (${url})`);
        });
    }
    window.webContents.setWindowOpenHandler(({ url }) => {
        void shell.openExternal(url);
        return { action: "deny" };
    });
    window.webContents.on("will-navigate", (event, url) => {
        if (url !== window.webContents.getURL()) {
            event.preventDefault();
            void shell.openExternal(url);
        }
    });

    const devUrl = process.env.SPINE_NOTES_DEV_URL;
    if (devUrl) {
        void window.loadURL(devUrl);
    } else {
        void window.loadFile(appHtmlPath);
    }
}

app.whenReady().then(() => {
    if (process.platform === "darwin" && app.dock) {
        app.dock.setIcon(iconPath);
    }
    createWindow();
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
