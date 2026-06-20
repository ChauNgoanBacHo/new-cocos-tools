import { app, dialog, ipcMain, shell } from "electron";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";

function getProjectRoot() {
    return app.isPackaged ? process.resourcesPath : app.getAppPath();
}

function getExtensionSourceDir() {
    return path.join(getProjectRoot(), "one-punch-extension");
}

function ensureExtensionExists() {
    const extensionDir = getExtensionSourceDir();
    if (!fs.existsSync(extensionDir)) {
        throw new Error("Không tìm thấy thư mục one-punch-extension.");
    }
    return extensionDir;
}

function zipDirectory(sourceDir: string, destinationZip: string) {
    return new Promise<void>((resolve, reject) => {
        execFile("zip", ["-yr", destinationZip, path.basename(sourceDir)], {
            cwd: path.dirname(sourceDir),
        }, (error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
}

export function registerExportCheatExtensionHandlers() {
    ipcMain.handle("cheat-extension:open-folder", async () => {
        const extensionDir = ensureExtensionExists();
        await shell.openPath(extensionDir);
        return {
            ok: true,
            path: extensionDir,
        };
    });

    ipcMain.handle("cheat-extension:export-zip", async () => {
        const extensionDir = ensureExtensionExists();
        const defaultPath = path.join(app.getPath("downloads"), "one-punch-tools-extension.zip");

        const result = await dialog.showSaveDialog({
            title: "Export Cheat Matrix Extension ZIP",
            defaultPath,
            filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
        });

        if (result.canceled || !result.filePath) {
            return {
                ok: false,
                cancelled: true,
            };
        }

        await zipDirectory(extensionDir, result.filePath);

        return {
            ok: true,
            filePath: result.filePath,
        };
    });
}
