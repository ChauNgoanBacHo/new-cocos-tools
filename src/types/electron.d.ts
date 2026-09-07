interface ElectronAPI {
    ping: () => Promise<string>;
    getAppVersion: () => Promise<string>;
    storage: {
        get: (key: string) => Promise<unknown>;
        set: (key: string, value: unknown) => Promise<boolean>;
        remove: (key: string) => Promise<boolean>;
    };
    selectFolder: () => Promise<string | null>;
    selectFile: () => Promise<string | null>;
    openExternalLink: (url: string) => Promise<{
        ok: boolean;
        error?: string;
    }>;
    openInVSCode: (filePath: string, line?: number | null, column?: number | null) => Promise<{
        ok: boolean;
        error?: string;
    }>;
    runEslint: (sourcePath: string) => Promise<{
        stdout: string;
        stderr: string;
        exitCode: number;
    }>;
    runCodeHealth: (sourcePath: string, mode: "full" | "eslint") => Promise<{
        mode: "full" | "eslint";
        exitCode: number;
        summary: {
            status: "success" | "issues" | "error";
            eslintErrors: number;
            eslintWarnings: number;
            typescriptErrors: number;
            totalFiles: number;
            totalIssues: number;
            healthScore: number;
        };
        eslint: {
            stdout: string;
            stderr: string;
            exitCode: number;
            errorCount: number;
            warningCount: number;
            files: Array<{
                filePath: string;
                absolutePath: string;
                errorCount: number;
                        warningCount: number;
                        issues: Array<{
                            source: "eslint" | "typescript";
                            severity: "error" | "warning";
                            location: {
                                line: number | null;
                        column: number | null;
                        label: string;
                    };
                    message: string;
                    ruleId: string;
                }>;
            }>;
        };
        typescript: {
            stdout: string;
            stderr: string;
            exitCode: number;
            errorCount: number;
            files: Array<{
                filePath: string;
                absolutePath: string;
                errorCount: number;
                warningCount: number;
                issues: Array<{
                    source: "eslint" | "typescript";
                    severity: "error" | "warning";
                    location: {
                        line: number | null;
                        column: number | null;
                        label: string;
                    };
                    message: string;
                    ruleId: string;
                }>;
            }>;
        };
        files: Array<{
            filePath: string;
            absolutePath: string;
            errorCount: number;
            warningCount: number;
            issues: Array<{
                source: "eslint" | "typescript";
                severity: "error" | "warning";
                location: {
                    line: number | null;
                    column: number | null;
                    label: string;
                };
                message: string;
                ruleId: string;
            }>;
        }>;
    }>;
    checkConfig: (configFilePath: string, sourcePath: string) => Promise<{
        stdout: string;
        stderr: string;
        exitCode: number;
        spineSummary: { spine: string; unusedAnims: string[] }[];
    }>;
    createAnimConfig: (spineDir: string, outputDir: string, animFileName: string, timeFileName: string, overwrite: boolean, excludeList?: string[]) => Promise<{
        stdout: string;
        stderr: string;
        exitCode: number;
    }>;
    createSoundConfig: (soundDir: string, outputDir: string, soundFileName: string, overwrite: boolean, excludeList?: string[]) => Promise<{
        stdout: string;
        stderr: string;
        exitCode: number;
    }>;
    selectSceneFile: () => Promise<string | null>;
    bindSoundRefs: (soundDir: string, sceneFilePath: string, componentHash: string) => Promise<{
        stdout: string;
        stderr: string;
        exitCode: number;
    }>;
    checkAssets: (sourceDir: string) => Promise<{
        sections: Array<{
            key: string;
            title: string;
            found: number;
            used: number;
            skipped: string[];
            unused: Array<{
                label: string;
                detail?: string;
                files: string[];
            }>;
        }>;
        totalUnused: number;
        totalUsed: number;
        exitCode: number;
        error?: string;
    }>;
    deleteAssets: (sourceDir: string, files: string[]) => Promise<{
        deleted: string[];
        failed: Array<{ file: string; error: string }>;
        exitCode: number;
    }>;
    spinePreview: (sourceDir: string) => Promise<{
        results: Array<{
            fileName: string;
            slots: number;
            atlasPages: number;
            estDrawcall: number;
            jsonPath: string;
            atlasPath: string;
            pngPaths: string[];
            version: string;
            animations: string[];
            skins: string[];
            validationErrors: string[];
        }>;
        exitCode: number;
        error?: string;
    }>;
    openSpinePreviewFullscreen: () => Promise<{ ok: boolean }>;
    closeSpinePreviewFullscreen: () => Promise<{ ok: boolean }>;
    sceneKit: {
        selectSourceFile: (sourceType?: "scene" | "fire") => Promise<string | null>;
        selectSceneOrPrefabFile: () => Promise<string | null>;
        previewBoilerplate: (sceneFilePath: string, tableFormat?: string, sourceType?: "scene" | "fire") => Promise<{
            gameId: string;
            sourceType?: "scene" | "fire";
            projectRoot: string;
            tableFormat: number[];
            files: Array<{
                filePath: string;
                status: "new" | "exists";
            }>;
            patches?: Array<{
                filePath: string;
                status: "exists" | "missing";
            }>;
        }>;
        createBoilerplate: (sceneFilePath: string, tableFormat?: string, sourceType?: "scene" | "fire") => Promise<{
            gameId: string;
            sourceType?: "scene" | "fire";
            projectRoot: string;
            tableFormat: number[];
            files: Array<{
                filePath: string;
                status: "created" | "exists" | "updated";
            }>;
        }>;
        replaceUuidRef: (targetFilePath: string, oldUuid: string, newUuid: string) => Promise<{
            targetFilePath: string;
            oldUuid: string;
            newUuid: string;
            replacements: Array<{
                from: string;
                to: string;
                count: number;
            }>;
            totalCount: number;
            changed: boolean;
        }>;
    };
    eventGraph: {
        scan: (sourcePath: string) => Promise<{
            sourcePath: string;
            scannedFiles: number;
            totalEvents: number;
            totalEmits: number;
            totalListeners: number;
            nodes: Array<{
                id: string;
                label: string;
                filePath: string;
                relativePath: string;
                emitCount: number;
                listenerCount: number;
            }>;
            edges: Array<{
                id: string;
                source: string;
                target: string;
                eventValue: string;
                emitCount: number;
                listenerCount: number;
            }>;
            usages: Array<{
                id: string;
                kind: "emit" | "on";
                eventValue: string;
                eventExpression: string;
                filePath: string;
                relativePath: string;
                componentName: string;
                functionName: string;
                line: number;
                column: number;
                caller: string;
            }>;
            orphanEmits: Array<{
                id: string;
                kind: "emit" | "on";
                eventValue: string;
                eventExpression: string;
                filePath: string;
                relativePath: string;
                componentName: string;
                functionName: string;
                line: number;
                column: number;
                caller: string;
            }>;
            orphanListeners: Array<{
                id: string;
                kind: "emit" | "on";
                eventValue: string;
                eventExpression: string;
                filePath: string;
                relativePath: string;
                componentName: string;
                functionName: string;
                line: number;
                column: number;
                caller: string;
            }>;
        }>;
        openFullscreen: () => Promise<{ ok: boolean }>;
        closeFullscreen: () => Promise<{ ok: boolean }>;
    };
    cheatLocalSocket: {
        start: (port?: number) => Promise<{
            enabled: boolean;
            running: boolean;
            host: string;
            port: number;
            clientCount: number;
            lastEventAt: number | null;
            lastEventType: string | null;
            lastError: string | null;
        }>;
        stop: () => Promise<{
            enabled: boolean;
            running: boolean;
            host: string;
            port: number;
            clientCount: number;
            lastEventAt: number | null;
            lastEventType: string | null;
            lastError: string | null;
        }>;
        status: () => Promise<{
            enabled: boolean;
            running: boolean;
            host: string;
            port: number;
            clientCount: number;
            lastEventAt: number | null;
            lastEventType: string | null;
            lastError: string | null;
        }>;
        emitTest: (payload?: Record<string, unknown>) => Promise<{ ok: true }>;
        onStatus: (
            listener: (status: {
                enabled: boolean;
                running: boolean;
                host: string;
                port: number;
                clientCount: number;
                lastEventAt: number | null;
                lastEventType: string | null;
                lastError: string | null;
            }) => void,
        ) => () => void;
        onEvent: (
            listener: (event: {
                type: string;
                [key: string]: unknown;
            }) => void,
        ) => () => void;
    };
    cheatExtension: {
        exportZip: () => Promise<
            | { ok: true; filePath: string }
            | { ok: false; cancelled: true }
        >;
        openFolder: () => Promise<{
            ok: true;
            path: string;
        }>;
    };
    driveSync: {
        getConfig: () => Promise<{
            baseUrl: string;
        }>;
        setConfig: (config: { baseUrl?: string }) => Promise<{
            baseUrl: string;
        }>;
        init: () => Promise<Array<{
            rootFolderId: string;
            rootFolderName: string;
            rootFolderPath: string;
            webViewLink: string;
            mentionUserIds: string[];
        }>>;
        getSyncPlan: (rootFolderId: string, scope?: 'today' | 'all') => Promise<{
            ok: true;
            rootFolderId: string;
            rootFolderName: string;
            scope: 'today' | 'all';
            totalFiles: number;
            totalBytes: number;
            items: Array<{
                fileId: string;
                fileName: string;
                filePathFromRoot: string;
                mimeType: string;
                size: number;
            }>;
        }>;
        getPendingFolders: (rootFolderId: string) => Promise<{
            ok: true;
            rootFolderId: string;
            rootFolderName: string;
            totalFiles: number;
            totalBytes: number;
            folders: Array<{
                folderPath: string;
                displayName: string;
                fileCount: number;
                totalBytes: number;
                newestModifiedTime: string;
                items: Array<{
                    fileId: string;
                    fileName: string;
                    filePathFromRoot: string;
                    parentFolderPathFromRoot: string;
                    mimeType: string;
                    size: number;
                    modifiedTime: string;
                    status: 'recent';
                }>;
            }>;
        }>;
        syncFolder: (rootFolderId: string, localPath: string, scope: 'today' | 'all', onProgress: (progress: { downloaded: number; total: number }) => void) => Promise<{
            success: boolean;
            failedFiles: Array<{ fileName: string; path: string; error: string }>;
            skippedFiles: Array<{ fileName: string; path: string; reason: string }>;
        }>;
        syncPendingFolders: (rootFolderId: string, localPath: string, folderPaths: string[], onProgress: (progress: { downloaded: number; total: number }) => void) => Promise<{
            success: boolean;
            failedFiles: Array<{ fileName: string; path: string; error: string }>;
            skippedFiles: Array<{ fileName: string; path: string; reason: string }>;
        }>;
        pauseSync: () => Promise<void>;
        reportComplete: (payload: {
            syncType: 'today' | 'full' | 'selected';
            rootFolderId: string;
            rootFolderName?: string;
            localPath: string;
            totalFiles?: number;
            totalBytes?: number;
            actorName?: string;
            success?: boolean;
        }) => Promise<{ ok: true; notified?: boolean; skipped?: boolean; reason?: string; syncType?: string }>;
    };
    matrixSync: {
        listByGame: (gameId: string) => Promise<{
            ok: true;
            gameId: string;
            items: Array<{
                id: string;
                gameId: string;
                slug: string;
                title: string;
                matrixData: string;
                tableFormat: string;
                additionalData: Record<string, string>;
                tags: string[];
                version: number;
                updatedAt: string;
                createdAt: string;
                publishedBy: string | null;
            }>;
            nextCursor: string | null;
            total: number;
        }>;
        getTemplate: (templateId: string) => Promise<{
            ok: true;
            item: {
                id: string;
                gameId: string;
                slug: string;
                title: string;
                matrixData: string;
                tableFormat: string;
                additionalData: Record<string, string>;
                tags: string[];
                version: number;
                updatedAt: string;
                createdAt: string;
                publishedBy: string | null;
            };
        }>;
        createTemplate: (payload: {
            gameId: string;
            gameName?: string;
            title?: string;
            matrixData: string;
            tableFormat: string;
            additionalData?: Record<string, string>;
            tags?: string[];
            publishedBy?: string | null;
        }) => Promise<{
            ok: true;
            item: {
                id: string;
                gameId: string;
                slug: string;
                title: string;
                matrixData: string;
                tableFormat: string;
                additionalData: Record<string, string>;
                tags: string[];
                version: number;
                updatedAt: string;
                createdAt: string;
                publishedBy: string | null;
            };
        }>;
    };
}

interface Window {
    electronAPI: ElectronAPI;
}
