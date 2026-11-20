import { app, BrowserWindow, ipcMain } from "electron";
import { autoUpdater, type ProgressInfo, type UpdateInfo } from "electron-updater";

export type AppUpdateStatus =
    | "disabled"
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "downloaded"
    | "not-available"
    | "error";

export type AppUpdateState = {
    status: AppUpdateStatus;
    currentVersion: string;
    version?: string;
    releaseName?: string;
    percent?: number;
    transferred?: number;
    total?: number;
    message?: string;
};

let updateState: AppUpdateState = {
    status: "idle",
    currentVersion: app.getVersion(),
};

let isInitialized = false;

function broadcastState() {
    for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
            window.webContents.send("app-update:state", updateState);
        }
    }
}

function setState(nextState: Partial<AppUpdateState>) {
    updateState = {
        ...updateState,
        ...nextState,
        currentVersion: app.getVersion(),
    };
    broadcastState();
}

function setAvailableUpdate(info: UpdateInfo, status: AppUpdateStatus) {
    setState({
        status,
        version: info.version,
        releaseName: typeof info.releaseName === "string" ? info.releaseName : undefined,
        message: undefined,
    });
}

async function checkForUpdates() {
    if (!app.isPackaged) {
        setState({
            status: "disabled",
            message: "Auto update is available in packaged builds only.",
        });
        return updateState;
    }

    if (updateState.status === "checking" || updateState.status === "downloading") {
        return updateState;
    }

    setState({ status: "checking", message: undefined, percent: undefined });
    try {
        await autoUpdater.checkForUpdates();
    } catch (error: unknown) {
        setState({
            status: "error",
            message: error instanceof Error ? error.message : "Unable to check for updates.",
        });
    }

    return updateState;
}

export function registerAppUpdaterHandlers() {
    ipcMain.handle("app-update:get-state", () => updateState);
    ipcMain.handle("app-update:check", () => checkForUpdates());
    ipcMain.handle("app-update:install", () => {
        if (updateState.status !== "downloaded") {
            return { ok: false, error: "The update has not finished downloading." };
        }

        setImmediate(() => autoUpdater.quitAndInstall(false, true));
        return { ok: true };
    });
}

export function initializeAppUpdater() {
    if (isInitialized) return;
    isInitialized = true;

    if (!app.isPackaged) {
        setState({
            status: "disabled",
            message: "Auto update is available in packaged builds only.",
        });
        return;
    }

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on("checking-for-update", () => {
        setState({ status: "checking", message: undefined, percent: undefined });
    });

    autoUpdater.on("update-available", (info: UpdateInfo) => {
        setAvailableUpdate(info, "available");
    });

    autoUpdater.on("update-not-available", (info: UpdateInfo) => {
        setState({
            status: "not-available",
            version: info.version,
            releaseName: undefined,
            percent: undefined,
            message: "You are using the latest version.",
        });
    });

    autoUpdater.on("download-progress", (progress: ProgressInfo) => {
        setState({
            status: "downloading",
            percent: Math.max(0, Math.min(100, progress.percent)),
            transferred: progress.transferred,
            total: progress.total,
            message: undefined,
        });
    });

    autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
        setAvailableUpdate(info, "downloaded");
        setState({ percent: 100, message: "Update ready. Restart the app to install it." });
    });

    autoUpdater.on("error", (error: Error) => {
        setState({
            status: "error",
            message: error.message || "Auto update failed.",
        });
    });

    setTimeout(() => {
        void checkForUpdates();
    }, 4000);
}
