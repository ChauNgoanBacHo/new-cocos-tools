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
    }>;
    createAnimConfig: (spineDir: string, outputDir: string, animFileName: string, timeFileName: string, overwrite: boolean) => Promise<{
        stdout: string;
        stderr: string;
        exitCode: number;
    }>;
    createSoundConfig: (soundDir: string, outputDir: string, soundFileName: string, overwrite: boolean) => Promise<{
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
        }>;
        exitCode: number;
        error?: string;
    }>;
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
                size: number;
            }>;
        }>;
        syncFolder: (rootFolderId: string, localPath: string, scope: 'today' | 'all', onProgress: (progress: { downloaded: number; total: number }) => void) => Promise<{
            success: boolean;
            failedFiles: Array<{ fileName: string; path: string; error: string }>;
        }>;
        pauseSync: () => Promise<void>;
        reportComplete: (payload: {
            syncType: 'today' | 'full';
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
                tableFormat: string;
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
                notes: string;
                version: number;
                updatedAt: string;
                createdAt: string;
                publishedBy: string | null;
            };
        }>;
        createTemplate: (payload: {
            gameId: string;
            title?: string;
            matrixData: string;
            tableFormat: string;
            additionalData?: Record<string, string>;
            tags?: string[];
            notes?: string;
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
                notes: string;
                version: number;
                updatedAt: string;
                createdAt: string;
                publishedBy: string | null;
            };
        }>;
        updateTemplate: (templateId: string, payload: {
            gameId: string;
            title?: string;
            matrixData: string;
            tableFormat: string;
            additionalData?: Record<string, string>;
            tags?: string[];
            notes?: string;
            publishedBy?: string | null;
            version?: number;
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
                notes: string;
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
