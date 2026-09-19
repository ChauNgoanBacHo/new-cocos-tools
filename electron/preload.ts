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
    openExternalLink: (url: string) => ipcRenderer.invoke("open-external-link", url),
    openInVSCode: (filePath: string, line?: number | null, column?: number | null) =>
        ipcRenderer.invoke("open-in-vscode", filePath, line, column),
    runEslint: (sourcePath: string) =>
        ipcRenderer.invoke("run-eslint", sourcePath),
    runCodeHealth: (sourcePath: string, mode: "full" | "eslint") =>
        ipcRenderer.invoke("run-code-health", sourcePath, mode),
    checkConfig: (configFilePath: string, sourcePath: string) =>
        ipcRenderer.invoke("check-config", configFilePath, sourcePath),
    createAnimConfig: (spineDir: string, outputDir: string, animFileName: string, timeFileName: string, overwrite: boolean, clearFull: boolean, excludeList?: string[]) =>
        ipcRenderer.invoke("create-anim-config", spineDir, outputDir, animFileName, timeFileName, overwrite, clearFull, excludeList),
    createSoundConfig: (soundDir: string, outputDir: string, soundFileName: string, overwrite: boolean, excludeList?: string[]) =>
        ipcRenderer.invoke("create-sound-config", soundDir, outputDir, soundFileName, overwrite, excludeList),
    selectSceneFile: () => ipcRenderer.invoke("select-scene-file"),
    bindSoundRefs: (soundDir: string, sceneFilePath: string, componentHash: string) =>
        ipcRenderer.invoke("bind-sound-refs", soundDir, sceneFilePath, componentHash),
    checkAssets: (sourceDir: string) =>
        ipcRenderer.invoke("check-assets", sourceDir),
    deleteAssets: (sourceDir: string, files: string[]) =>
        ipcRenderer.invoke("delete-assets", sourceDir, files),
    spinePreview: (sourceDir: string) =>
        ipcRenderer.invoke("spine-preview", sourceDir),
    openSpinePreviewFullscreen: () => ipcRenderer.invoke("spine-preview:open-fullscreen"),
    closeSpinePreviewFullscreen: () => ipcRenderer.invoke("spine-preview:close-fullscreen"),
    sceneKit: {
        selectSourceFile: (sourceType?: "scene" | "fire") =>
            ipcRenderer.invoke("scene-kit:select-source-file", sourceType),
        selectSceneOrPrefabFile: () =>
            ipcRenderer.invoke("scene-kit:select-scene-or-prefab-file"),
        previewBoilerplate: (sceneFilePath: string, tableFormat?: string, sourceType?: "scene" | "fire") =>
            ipcRenderer.invoke("scene-kit:preview-boilerplate", sceneFilePath, tableFormat, sourceType),
        createBoilerplate: (sceneFilePath: string, tableFormat?: string, sourceType?: "scene" | "fire") =>
            ipcRenderer.invoke("scene-kit:create-boilerplate", sceneFilePath, tableFormat, sourceType),
        replaceUuidRef: (targetFilePath: string, oldUuid: string, newUuid: string) =>
            ipcRenderer.invoke("scene-kit:replace-uuid-ref", targetFilePath, oldUuid, newUuid),
    },
    replaceSprite: {
        selectSceneFile: () => ipcRenderer.invoke("replace-sprite:select-scene-file"),
        run: (sceneFilePath: string, gameId: string, mappings: string) =>
            ipcRenderer.invoke("replace-sprite:run", sceneFilePath, gameId, mappings),
    },
    eventGraph: {
        scan: (sourcePath: string) => ipcRenderer.invoke("event-graph:scan", sourcePath),
        openFullscreen: () => ipcRenderer.invoke("event-graph:open-fullscreen"),
        closeFullscreen: () => ipcRenderer.invoke("event-graph:close-fullscreen"),
    },
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
        getConfig: () => ipcRenderer.invoke("drive-sync:get-config"),
        setConfig: (config: { baseUrl?: string }) => ipcRenderer.invoke("drive-sync:set-config", config),
        init: () => ipcRenderer.invoke("drive-sync:init"),
        getSyncPlan: (rootFolderId: string, scope?: 'today' | 'all') => ipcRenderer.invoke("drive-sync:sync-plan", rootFolderId, scope),
        getPendingFolders: (rootFolderId: string) => ipcRenderer.invoke("drive-sync:pending-folders", rootFolderId),
        getSyncStatus: () => ipcRenderer.invoke("drive-sync:status"),
        syncFolder: (rootFolderId: string, localPath: string, scope: 'today' | 'all', onProgress: (progress: { downloaded: number; total: number }) => void) => {
            ipcRenderer.removeAllListeners("drive-sync:progress");
            ipcRenderer.on("drive-sync:progress", (_, progress) => onProgress(progress));
            return ipcRenderer.invoke("drive-sync:sync-folder", rootFolderId, localPath, scope) as Promise<{
                success: boolean;
                failedFiles: Array<{ fileName: string; path: string; error: string }>;
                skippedFiles: Array<{ fileName: string; path: string; reason: string }>;
            }>;
        },
        syncPendingFolders: (rootFolderId: string, localPath: string, folderPaths: string[], onProgress: (progress: { downloaded: number; total: number }) => void) => {
            ipcRenderer.removeAllListeners("drive-sync:progress");
            ipcRenderer.on("drive-sync:progress", (_, progress) => onProgress(progress));
            return ipcRenderer.invoke("drive-sync:sync-pending-folders", rootFolderId, localPath, folderPaths) as Promise<{
                success: boolean;
                failedFiles: Array<{ fileName: string; path: string; error: string }>;
                skippedFiles: Array<{ fileName: string; path: string; reason: string }>;
            }>;
        },
        pauseSync: () => ipcRenderer.invoke("drive-sync:pause"),
        reportComplete: (payload: {
            syncType: 'today' | 'full' | 'selected';
            rootFolderId: string;
            rootFolderName?: string;
            localPath: string;
            totalFiles?: number;
            totalBytes?: number;
            actorName?: string;
            success?: boolean;
        }) => ipcRenderer.invoke("drive-sync:report-complete", payload),
    },
    matrixSync: {
        listByGame: (gameId: string) => ipcRenderer.invoke("matrix-sync:list-by-game", gameId),
        getTemplate: (templateId: string) => ipcRenderer.invoke("matrix-sync:get-template", templateId),
        createTemplate: (payload: unknown) => ipcRenderer.invoke("matrix-sync:create-template", payload),
        updateTemplate: (templateId: string, payload: unknown) => ipcRenderer.invoke("matrix-sync:update-template", templateId, payload),
    },
});
