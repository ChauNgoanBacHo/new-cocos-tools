// electron/preload.ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
    ping: () => ipcRenderer.invoke("ping"),
    getAppVersion: () => ipcRenderer.invoke("get-app-version"),
    storage: {
        get: (key: string) => ipcRenderer.invoke("storage:get", key),
        set: (key: string, value: unknown) => ipcRenderer.invoke("storage:set", key, value),
        remove: (key: string) => ipcRenderer.invoke("storage:remove", key),
    },
    selectFolder: () => ipcRenderer.invoke("select-folder"),
    selectFile: () => ipcRenderer.invoke("select-file"),
    openInVSCode: (filePath: string, line?: number | null, column?: number | null) =>
        ipcRenderer.invoke("open-in-vscode", filePath, line, column),
    runEslint: (sourcePath: string) =>
        ipcRenderer.invoke("run-eslint", sourcePath),
    runCodeHealth: (sourcePath: string, mode: "full" | "eslint") =>
        ipcRenderer.invoke("run-code-health", sourcePath, mode),
    checkConfig: (configFilePath: string, sourcePath: string) =>
        ipcRenderer.invoke("check-config", configFilePath, sourcePath),
    createAnimConfig: (spineDir: string, outputDir: string, animFileName: string, timeFileName: string, overwrite: boolean) =>
        ipcRenderer.invoke("create-anim-config", spineDir, outputDir, animFileName, timeFileName, overwrite),
    createSoundConfig: (soundDir: string, outputDir: string, soundFileName: string, overwrite: boolean) =>
        ipcRenderer.invoke("create-sound-config", soundDir, outputDir, soundFileName, overwrite),
    selectSceneFile: () => ipcRenderer.invoke("select-scene-file"),
    bindSoundRefs: (soundDir: string, sceneFilePath: string, componentHash: string) =>
        ipcRenderer.invoke("bind-sound-refs", soundDir, sceneFilePath, componentHash),
    checkAssets: (sourceDir: string) =>
        ipcRenderer.invoke("check-assets", sourceDir),
    deleteAssets: (sourceDir: string, files: string[]) =>
        ipcRenderer.invoke("delete-assets", sourceDir, files),
    spinePreview: (sourceDir: string) =>
        ipcRenderer.invoke("spine-preview", sourceDir),
    cheatLocalSocket: {
        start: (port?: number) => ipcRenderer.invoke("cheat-local-socket:start", port),
        stop: () => ipcRenderer.invoke("cheat-local-socket:stop"),
        status: () => ipcRenderer.invoke("cheat-local-socket:status"),
        emitTest: (payload?: Record<string, unknown>) => ipcRenderer.invoke("cheat-local-socket:emit-test", payload),
        onStatus: (listener: (status: unknown) => void) => {
            const wrapped = (_event: unknown, status: unknown) => listener(status);
            ipcRenderer.on("cheat-local-socket:status", wrapped);
            return () => ipcRenderer.removeListener("cheat-local-socket:status", wrapped);
        },
        onEvent: (listener: (event: unknown) => void) => {
            const wrapped = (_event: unknown, payload: unknown) => listener(payload);
            ipcRenderer.on("cheat-local-socket:event", wrapped);
            return () => ipcRenderer.removeListener("cheat-local-socket:event", wrapped);
        },
    },
    cheatExtension: {
        exportZip: () => ipcRenderer.invoke("cheat-extension:export-zip"),
        openFolder: () => ipcRenderer.invoke("cheat-extension:open-folder"),
    },
    driveSync: {
        init: () => ipcRenderer.invoke("drive-sync:init"),
        getSyncPlan: (rootFolderId: string, scope?: 'today' | 'all') => ipcRenderer.invoke("drive-sync:sync-plan", rootFolderId, scope),
        getSyncStatus: () => ipcRenderer.invoke("drive-sync:status"),
        syncFolder: (rootFolderId: string, localPath: string, scope: 'today' | 'all', onProgress: (progress: { downloaded: number; total: number }) => void) => {
            ipcRenderer.removeAllListeners("drive-sync:progress");
            ipcRenderer.on("drive-sync:progress", (_, progress) => onProgress(progress));
            return ipcRenderer.invoke("drive-sync:sync-folder", rootFolderId, localPath, scope) as Promise<{
                success: boolean;
                failedFiles: Array<{ fileName: string; path: string; error: string }>;
            }>;
        },
        pauseSync: () => ipcRenderer.invoke("drive-sync:pause"),
        reportComplete: (payload: {
            syncType: 'today' | 'full';
            rootFolderId: string;
            rootFolderName?: string;
            localPath: string;
            totalFiles?: number;
            totalBytes?: number;
            actorName?: string;
            success?: boolean;
        }) => ipcRenderer.invoke("drive-sync:report-complete", payload),
    },
});
