import { ipcMain, BrowserWindow } from 'electron';
import { join } from 'path';
import { writeFile, mkdir } from 'fs/promises';
import { DriveSyncClient } from './api-client';
import { DriveSyncPoller } from './poller';
import { FileSync } from './file-sync';

function isGoogleWorkspaceMimeType(mimeType: string) {
  return mimeType.startsWith('application/vnd.google-apps.');
}

export function setupDriveSyncHandlers(
  baseUrl: string,
  apiKey?: string,
  localRootPath?: string
) {
  const client = new DriveSyncClient(baseUrl, apiKey);
  const rootMappings = new Map<string, string>();
  const fileSync = new FileSync(client, rootMappings);
  let poller: DriveSyncPoller | undefined;
  let pauseRequested = false;

  ipcMain.handle('drive-sync:get-config', () => ({
    baseUrl: client.getBaseUrl(),
  }));

  ipcMain.handle('drive-sync:set-config', (_event, config: { baseUrl?: string }) => {
    if (config.baseUrl) {
      client.setBaseUrl(config.baseUrl);
    }

    return {
      baseUrl: client.getBaseUrl(),
    };
  });

  ipcMain.handle('drive-sync:init', async () => {
    const folders = await client.getWatchFolders();
    if (localRootPath) {
      folders.forEach(f => {
        rootMappings.set(f.rootFolderId, `${localRootPath}/${f.rootFolderName}`);
      });
    }
    return folders;
  });

  ipcMain.handle('drive-sync:status', () => client.getSyncStatus());

  ipcMain.handle('drive-sync:sync-plan', (_event, rootFolderId: string, scope?: 'today' | 'all') =>
    client.getSyncPlan(rootFolderId, scope)
  );

  ipcMain.handle('drive-sync:start', (_event, pollIntervalMs?: number) => {
    if (poller) return;
    poller = new DriveSyncPoller(client, async (events) => {
      for (const e of events) await fileSync.handleChange(e);
    }, pollIntervalMs);
    poller.start();
  });

  ipcMain.handle('drive-sync:stop', () => {
    poller?.stop();
    poller = undefined;
  });

  ipcMain.handle('drive-sync:sync-folder', async (event, rootFolderId: string, localPath: string, scope?: 'today' | 'all') => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const plan = await client.getSyncPlan(rootFolderId, scope);
    pauseRequested = false;

    const downloadableItems = plan.items.filter(item => !isGoogleWorkspaceMimeType(item.mimeType));
    const downloadTotal = downloadableItems.length;

    if (plan.items.length === 0) {
      return { success: true, failedFiles: [], skippedFiles: [] };
    }

    let downloadedCount = 0;
    const failedFiles: Array<{ fileName: string; path: string; error: string }> = [];
    const skippedFiles: Array<{ fileName: string; path: string; reason: string }> = [];

    for (const item of plan.items) {
      if (pauseRequested) {
        throw new Error('PAUSED: Sync paused by user');
      }

      try {
        if (isGoogleWorkspaceMimeType(item.mimeType)) {
          skippedFiles.push({
            fileName: item.fileName,
            path: item.filePathFromRoot,
            reason: `Skipped Google Workspace file (${item.mimeType})`,
          });
          continue;
        }

        const filePath = join(localPath, item.filePathFromRoot);
        await mkdir(join(filePath, '..'), { recursive: true });
        const data = await client.downloadFile(item.fileId);
        await writeFile(filePath, Buffer.from(data));
        downloadedCount++;
        win?.webContents.send('drive-sync:progress', { downloaded: downloadedCount, total: downloadTotal });
      } catch (err: any) {
        console.error(`Failed to download ${item.fileName}:`, err.message);
        failedFiles.push({
          fileName: item.fileName,
          path: item.filePathFromRoot,
          error: err.message
        });
      }
    }

    return { success: failedFiles.length === 0, failedFiles, skippedFiles };
  });

  ipcMain.handle('drive-sync:pause', () => {
    pauseRequested = true;
  });

  ipcMain.handle('drive-sync:report-complete', (_event, payload: {
    syncType: 'today' | 'full';
    rootFolderId: string;
    rootFolderName?: string;
    localPath: string;
    totalFiles?: number;
    totalBytes?: number;
    actorName?: string;
    success?: boolean;
  }) => {
    return client.reportSyncComplete(payload);
  });
}
