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
    openInVSCode: (filePath: string, line?: number | null, column?: number | null) => Promise<{
        ok: boolean;
        error?: string;
    }>;
    runEslint: (sourcePath: string) => Promise<{
        stdout: string;
        stderr: string;
        exitCode: number;
    }>;
    runCodeHealth: (sourcePath: string, mode: "full" | "eslint" | "knip") => Promise<{
        mode: "full" | "eslint" | "knip";
        exitCode: number;
        summary: {
            status: "success" | "issues" | "error";
            eslintErrors: number;
            eslintWarnings: number;
            knipOrphanFiles: number;
            knipUnusedExports: number;
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
                    source: "eslint" | "knip";
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
        knip: {
            stdout: string;
            stderr: string;
            exitCode: number;
            orphanFiles: number;
            unusedExports: number;
            files: Array<{
                filePath: string;
                absolutePath: string;
                errorCount: number;
                warningCount: number;
                issues: Array<{
                    source: "eslint" | "knip";
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
                source: "eslint" | "knip";
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
}

interface Window {
    electronAPI: ElectronAPI;
}
