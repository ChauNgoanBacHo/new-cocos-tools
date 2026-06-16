import { ipcRenderer } from 'electron';
import type { WatchFolder, SyncPlanResponse, SyncStatusResponse } from './types';

export const driveSyncAPI = {
  init: () => ipcRenderer.invoke('drive-sync:init') as Promise<WatchFolder[]>,
  getSyncPlan: (rootFolderId: string, scope?: 'today' | 'all') => ipcRenderer.invoke('drive-sync:sync-plan', rootFolderId, scope) as Promise<SyncPlanResponse>,
  getSyncStatus: () => ipcRenderer.invoke('drive-sync:status') as Promise<SyncStatusResponse>,
  syncFolder: (rootFolderId: string, localPath: string, scope: 'today' | 'all', onProgress: (percent: number) => void) => {
    ipcRenderer.on('drive-sync:progress', (_, percent) => onProgress(percent));
    return ipcRenderer.invoke('drive-sync:sync-folder', rootFolderId, localPath, scope);
  }
};

export const selectFolder = () => ipcRenderer.invoke('select-folder') as Promise<string | null>;
