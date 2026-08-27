import { useState, useEffect, useRef } from 'react';
import type { WatchFolder } from '../features/drive-sync/types';
import { INTERNAL_API_BASE_URL, normalizeInternalApiBaseUrl } from '../constants/internalApi';
import { useStoredState } from '../hooks/useStoredState';
import { SPINE_ALIASES_STORAGE_KEY, type PathAlias } from '../constants/spineAliases';

interface PendingSyncFolder {
  folderPath: string;
  displayName: string;
  fileCount: number;
  totalBytes: number;
  newestModifiedTime: string;
  items: Array<{
    fileName: string;
    filePathFromRoot: string;
    size?: number;
    modifiedTime?: string;
    status: 'recent';
  }>;
}

export function DriveSyncMenu() {
  const [folders, setFolders] = useState<WatchFolder[]>([]);
  const [apiBaseUrl, setApiBaseUrl] = useStoredState<string>('drive-sync-api-base-url', INTERNAL_API_BASE_URL);
  const [selectedDrive, setSelectedDrive] = useStoredState<string>('drive-sync-selected-drive', '');
  const [localRoot, setLocalRoot] = useStoredState<string>('drive-sync-local-root', '');
  const [aliases] = useStoredState<PathAlias[]>(SPINE_ALIASES_STORAGE_KEY, []);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState({ downloaded: 0, total: 0 });
  const [error, setError] = useState('');
  const [totalFiles, setTotalFiles] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [scope, setScope] = useState<'today' | 'all' | 'selected'>('today');
  const [failedFiles, setFailedFiles] = useState<Array<{ fileName: string; path: string; error: string }>>([]);
  const [skippedFiles, setSkippedFiles] = useState<Array<{ fileName: string; path: string; reason: string }>>([]);
  const [pendingFolders, setPendingFolders] = useState<PendingSyncFolder[]>([]);
  const [selectedPendingFolderPaths, setSelectedPendingFolderPaths] = useState<string[]>([]);
  const [loadingPendingFolders, setLoadingPendingFolders] = useState(false);
  const [paused, setPaused] = useState(false);
  const [selectedOutputAliasId, setSelectedOutputAliasId] = useState('');
  const syncIdRef = useRef(0);
  const sortedAliases = [...aliases].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }),
  );

  useEffect(() => {
    void handleRefreshDriveFolders();
  }, []);

  const handleRefreshDriveFolders = async () => {
    const nextBaseUrl = normalizeInternalApiBaseUrl(apiBaseUrl);
    if (!nextBaseUrl) {
      setError('Drive API URL is required');
      setFolders([]);
      return;
    }

    try {
      setError('');
      if (nextBaseUrl !== apiBaseUrl) {
        setApiBaseUrl(nextBaseUrl);
      }
      const config = await window.electronAPI.driveSync.setConfig({ baseUrl: nextBaseUrl });
      if (config.baseUrl !== apiBaseUrl) {
        setApiBaseUrl(config.baseUrl);
      }
      const nextFolders = await window.electronAPI.driveSync.init();
      setFolders(nextFolders);
    } catch (e: any) {
      setFolders([]);
      setError(e.message || 'Failed to load Drive folders');
    }
  };

  const handleSelectFolder = async () => {
    const path = await window.electronAPI.selectFolder();
    if (path) {
      setLocalRoot(path);
    }
  };

  const handleUseOutputAlias = (alias: PathAlias) => {
    setSelectedOutputAliasId(alias.id);
    setLocalRoot(alias.path);
  };

  const clearPendingFolders = () => {
    setPendingFolders([]);
    setSelectedPendingFolderPaths([]);
    setTotalFiles(0);
    setTotalBytes(0);
  };

  const handleLoadPendingFolders = async (rootFolderId = selectedDrive) => {
    if (!rootFolderId || !apiBaseUrl.trim()) return;

    setError('');
    setFailedFiles([]);
    setSkippedFiles([]);
    setLoadingPendingFolders(true);

    try {
      await window.electronAPI.driveSync.setConfig({ baseUrl: normalizeInternalApiBaseUrl(apiBaseUrl) });
      const pending = await window.electronAPI.driveSync.getPendingFolders(rootFolderId);
      setTotalFiles(pending.totalFiles);
      setTotalBytes(pending.totalBytes);
      setPendingFolders(pending.folders);
      setSelectedPendingFolderPaths(pending.folders.map((folder) => folder.folderPath));
      if (pending.totalFiles === 0) {
        setError('No folders updated in the last 3 days.');
      }
    } catch (e: any) {
      setPendingFolders([]);
      setSelectedPendingFolderPaths([]);
      setError(e.message || 'Failed to scan pending folders');
    } finally {
      setLoadingPendingFolders(false);
    }
  };

  const handleTogglePendingFolder = (folderPath: string) => {
    setSelectedPendingFolderPaths((current) =>
      current.includes(folderPath)
        ? current.filter((item) => item !== folderPath)
        : [...current, folderPath],
    );
  };

  const handleSync = async (syncScope: 'today' | 'all') => {
    console.log('[DriveSyncMenu] handleSync called with scope:', syncScope);
    console.log('[DriveSyncMenu] selectedDrive:', selectedDrive);
    console.log('[DriveSyncMenu] localRoot:', localRoot);

    if (!selectedDrive || !localRoot) return;

    const currentSyncId = ++syncIdRef.current;

    setError('');
    setFailedFiles([]);
    setSkippedFiles([]);
    setSyncing(true);
    setPaused(false);
    setProgress({ downloaded: 0, total: 0 });
    setScope(syncScope);

    try {
      const nextBaseUrl = normalizeInternalApiBaseUrl(apiBaseUrl);
      setApiBaseUrl(nextBaseUrl);
      await window.electronAPI.driveSync.setConfig({ baseUrl: nextBaseUrl });

      console.log('[DriveSyncMenu] Calling getSyncPlan...');
      const plan = await window.electronAPI.driveSync.getSyncPlan(selectedDrive, syncScope);
      console.log('[DriveSyncMenu] getSyncPlan result:', plan);

      if (syncIdRef.current !== currentSyncId) return;

      setTotalFiles(plan.totalFiles);
      setTotalBytes(plan.totalBytes);
      setProgress({
        downloaded: 0,
        total: plan.items.filter((item) => !item.mimeType?.startsWith('application/vnd.google-apps.')).length,
      });

      if (plan.totalFiles === 0) {
        if (syncIdRef.current === currentSyncId) {
          setError(`No files to sync (${syncScope === 'today' ? 'no changes today' : 'folder is empty'})`);
        }
        return;
      }

      console.log('[DriveSyncMenu] Calling syncFolder...');
      const result = await window.electronAPI.driveSync.syncFolder(selectedDrive, localRoot, syncScope, (p) => {
        if (syncIdRef.current === currentSyncId) {
          setProgress(p);
        }
      });
      console.log('[DriveSyncMenu] syncFolder result:', result);

      if (syncIdRef.current !== currentSyncId) return;

      if (result.failedFiles.length > 0) {
        setFailedFiles(result.failedFiles);
        window.electronAPI.storage.set('drive-sync-failed-files', result.failedFiles).catch(() => {});
      }
      if (result.skippedFiles.length > 0) {
        setSkippedFiles(result.skippedFiles);
      }

      // Report sync complete to backend (Discord notification)
      if (result.success || result.failedFiles.length === 0) {
        try {
          const selectedFolder = folders.find(f => f.rootFolderId === selectedDrive);
          await window.electronAPI.driveSync.reportComplete({
            syncType: syncScope === 'all' ? 'full' : syncScope,
            rootFolderId: selectedDrive,
            rootFolderName: selectedFolder?.rootFolderName,
            localPath: localRoot,
            totalFiles: plan.totalFiles,
            totalBytes: plan.totalBytes,
            success: true
          });
        } catch (reportErr) {
          console.error('[DriveSyncMenu] Failed to report sync complete:', reportErr);
        }
      }
    } catch (e: any) {
      if (syncIdRef.current !== currentSyncId) return;

      const msg = e.message || 'Unknown error';
      if (msg.includes('PAUSED')) {
        setError('Sync paused by user');
        setPaused(true);
      } else if (msg.includes('403') || msg.includes('401')) {
        setError('Access denied - app does not have permission to this Drive folder');
      } else if (msg.includes('404')) {
        setError('Drive folder not found');
      } else {
        setError(msg);
      }
    } finally {
      if (syncIdRef.current === currentSyncId) {
        setSyncing(false);
      }
    }
  };

  const handleSyncSelected = async () => {
    if (!selectedDrive || !localRoot || selectedPendingFolderPaths.length === 0) return;

    const currentSyncId = ++syncIdRef.current;

    setError('');
    setFailedFiles([]);
    setSkippedFiles([]);
    setSyncing(true);
    setPaused(false);
    setProgress({ downloaded: 0, total: 0 });
    setScope('selected');

    try {
      const nextBaseUrl = normalizeInternalApiBaseUrl(apiBaseUrl);
      setApiBaseUrl(nextBaseUrl);
      await window.electronAPI.driveSync.setConfig({ baseUrl: nextBaseUrl });
      const result = await window.electronAPI.driveSync.syncPendingFolders(
        selectedDrive,
        localRoot,
        selectedPendingFolderPaths,
        (p) => {
          if (syncIdRef.current === currentSyncId) {
            setProgress(p);
          }
        },
      );

      if (syncIdRef.current !== currentSyncId) return;

      if (result.failedFiles.length > 0) {
        setFailedFiles(result.failedFiles);
        window.electronAPI.storage.set('drive-sync-failed-files', result.failedFiles).catch(() => {});
      }
      if (result.skippedFiles.length > 0) {
        setSkippedFiles(result.skippedFiles);
      }
      if (result.success) {
        const syncedFolders = pendingFolders.filter((folder) => selectedPendingFolderPaths.includes(folder.folderPath));
        const syncedFileCount = syncedFolders.reduce((sum, folder) => sum + folder.fileCount, 0);
        const syncedTotalBytes = syncedFolders.reduce((sum, folder) => sum + folder.totalBytes, 0);

        try {
          const selectedFolder = folders.find(f => f.rootFolderId === selectedDrive);
          await window.electronAPI.driveSync.reportComplete({
            syncType: 'selected',
            rootFolderId: selectedDrive,
            rootFolderName: selectedFolder?.rootFolderName,
            localPath: localRoot,
            totalFiles: syncedFileCount,
            totalBytes: syncedTotalBytes,
            success: true
          });
        } catch (reportErr) {
          console.error('[DriveSyncMenu] Failed to report selected sync complete:', reportErr);
        }

        const syncedFolderPaths = new Set(selectedPendingFolderPaths);
        const remainingFolders = pendingFolders.filter((folder) => !syncedFolderPaths.has(folder.folderPath));
        setPendingFolders(remainingFolders);
        setSelectedPendingFolderPaths([]);
        setTotalFiles(remainingFolders.reduce((sum, folder) => sum + folder.fileCount, 0));
        setTotalBytes(remainingFolders.reduce((sum, folder) => sum + folder.totalBytes, 0));
      }
    } catch (e: any) {
      if (syncIdRef.current !== currentSyncId) return;

      const msg = e.message || 'Unknown error';
      if (msg.includes('PAUSED')) {
        setError('Sync paused by user');
        setPaused(true);
      } else {
        setError(msg);
      }
    } finally {
      if (syncIdRef.current === currentSyncId) {
        setSyncing(false);
      }
    }
  };

  const handlePause = () => {
    window.electronAPI.driveSync.pauseSync();
    setPaused(true);
    setSyncing(false);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const formatDateTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'unknown';
    return date.toLocaleString(undefined, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const selectedPendingFileCount = pendingFolders
    .filter((folder) => selectedPendingFolderPaths.includes(folder.folderPath))
    .reduce((sum, folder) => sum + folder.fileCount, 0);

  const getRelativeFileLabel = (folderPath: string, filePath: string, fileName: string) => {
    if (!folderPath) return filePath || fileName;

    const prefix = `${folderPath}/`;
    return filePath.startsWith(prefix) ? filePath.slice(prefix.length) : (filePath || fileName);
  };

  return (
    <div className="sm:col-span-2">
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 dark:border-zinc-700 pb-4">
        <div className="text-left">
          <h2 className="text-2xl font-bold text-[#9b8cff] mb-1">Drive Synchronizer</h2>
          <p className="text-slate-500 dark:text-zinc-400 text-xs">
            Sync assets from Google Drive to local folder
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 dark:bg-[#2b3140] dark:border-white/5 rounded-2xl shadow-[0_18px_36px_rgba(148,163,184,0.16)] dark:shadow-[0_18px_36px_rgba(10,12,18,0.28)] overflow-hidden">
        <div className="py-6 space-y-6">
          {error && (
            <div className="px-6">
              <div className="p-4 rounded-xl border text-sm font-medium transition-all bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700 text-red-800 dark:text-red-400">
                {error}
              </div>
            </div>
          )}

          {!syncing && totalFiles > 0 && (
            <div className="px-6">
              <div className="p-4 rounded-xl border text-sm font-medium transition-all bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-400">
                Found {totalFiles} files ({formatBytes(totalBytes)})
              </div>
            </div>
          )}

          <div className="px-6 pb-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-zinc-600 pb-2.5 mb-2">
              <svg className="h-4 w-4 text-[#b7a8ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5A1.75 1.75 0 015.5 5.75h4l1.5 1.75h7a1.75 1.75 0 011.75 1.75v7A1.75 1.75 0 0118 18H5.5a1.75 1.75 0 01-1.75-1.75v-8.75z" />
              </svg>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 font-mono">
                Configuration
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-2 sm:gap-4 items-center">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400 text-left">
                API URL <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={apiBaseUrl}
                  onChange={e => setApiBaseUrl(e.target.value)}
                  onBlur={() => {
                    void handleRefreshDriveFolders();
                  }}
                  disabled={syncing}
                  placeholder="https://black-adam-bot.fly.dev"
                  className="min-w-0 flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-[#1b2029] dark:border-white/5 dark:text-zinc-100 dark:placeholder-zinc-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    void handleRefreshDriveFolders();
                  }}
                  title="Reload Drive folders"
                  aria-label="Reload Drive folders"
                  disabled={syncing || !apiBaseUrl.trim()}
                  className="h-11 w-11 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-700 hover:border-[#7d6df7]/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-400 dark:hover:bg-[#232938] dark:hover:text-zinc-200">
                  <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 0113.08-4.95M19.5 12a7.5 7.5 0 01-13.08 4.95M16.5 4.5H18v1.5M6 18H4.5v-1.5" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-2 sm:gap-4 items-center">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400 text-left">
                Path <span className="text-red-500">*</span>
              </label>
              <div>
                <select
                  value={selectedDrive}
                  onChange={e => {
                    const nextDrive = e.target.value;
                    setSelectedDrive(nextDrive);
                    clearPendingFolders();
                  }}
                  disabled={syncing}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-[#1b2029] dark:border-white/5 dark:text-zinc-100">
                  <option value="">-- Choose Drive Folder --</option>
                  {folders.map(f => (
                    <option key={f.rootFolderId} value={f.rootFolderId}>{f.rootFolderName}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-2 sm:gap-4 items-center">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400 text-left">
                Output Folder <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={localRoot}
                  readOnly
                  placeholder="Click Browse to select folder"
                  className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 text-sm focus:outline-none dark:bg-[#1b2029] dark:border-white/5 dark:text-zinc-100 dark:placeholder-zinc-500"
                />
                <button
                  type="button"
                  onClick={handleSelectFolder}
                  title="Browse output folder"
                  aria-label="Browse output folder"
                  disabled={syncing}
                  className="h-11 w-11 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-700 hover:border-[#7d6df7]/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-400 dark:hover:bg-[#232938] dark:hover:text-zinc-200">
                  <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5A1.75 1.75 0 015.5 5.75h4l1.5 1.75h7a1.75 1.75 0 011.75 1.75v7A1.75 1.75 0 0118 18H5.5a1.75 1.75 0 01-1.75-1.75v-8.75z" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-2 sm:gap-4 items-center">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400 text-left">
                Alias
              </label>
              <div className="min-w-0 space-y-2">
                {sortedAliases.length > 0 ? (
                  <div className="flex min-w-0 gap-2">
                    <select
                      value={selectedOutputAliasId}
                      onChange={(event) => {
                        setSelectedOutputAliasId(event.target.value);
                        const alias = aliases.find((item) => item.id === event.target.value);
                        if (alias) handleUseOutputAlias(alias);
                      }}
                      disabled={syncing}
                      className="min-w-0 flex-1 truncate px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:border-[#7d6df7] focus:ring-1 focus:ring-[#7d6df7]/25 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-[#1b2029] dark:border-white/5 dark:text-zinc-100">
                      <option value="">Select output alias...</option>
                      {sortedAliases.map((alias) => (
                        <option key={alias.id} value={alias.id}>
                          {alias.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-400">
                    <span>Go to</span>
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-[#7d6df7]/25">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                        />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </span>
                    <span>to create shared path aliases.</span>
                  </div>
                )}
                {selectedOutputAliasId && (
                  <div className="truncate text-[11px] text-slate-500 dark:text-zinc-400">
                    {sortedAliases.find((alias) => alias.id === selectedOutputAliasId)?.path}
                  </div>
                )}
              </div>
            </div>
          </div>

          {selectedDrive && (
            <div className="px-6">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/5 dark:bg-[#1b2029]">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="text-left">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-200 font-mono">
                      Pending Folders
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
                      {pendingFolders.length > 0
                        ? `${pendingFolders.length} folder(s), ${totalFiles} pending file(s)`
                        : 'Scan Drive for folders with files updated in the last 3 days.'}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {pendingFolders.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setSelectedPendingFolderPaths(pendingFolders.map((folder) => folder.folderPath))}
                          disabled={syncing || loadingPendingFolders}
                          className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 transition-all hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed dark:border-white/5 dark:bg-[#232938] dark:text-zinc-200 dark:hover:bg-[#2c3344]">
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedPendingFolderPaths([])}
                          disabled={syncing || loadingPendingFolders}
                          className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 transition-all hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed dark:border-white/5 dark:bg-[#232938] dark:text-zinc-200 dark:hover:bg-[#2c3344]">
                          Clear
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        void handleLoadPendingFolders();
                      }}
                      disabled={syncing || loadingPendingFolders || !apiBaseUrl.trim()}
                      className="px-3 py-2 rounded-xl border border-[#7d6df7]/25 bg-white text-xs font-bold text-[#6b5ee8] transition-all hover:bg-[#7d6df7]/10 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-[#232938] dark:text-[#b7a8ff] dark:hover:bg-[#7d6df7]/15">
                      {loadingPendingFolders ? 'Scanning...' : 'Scan Now'}
                    </button>
                  </div>
                </div>

                {pendingFolders.length > 0 && (
                  <div className="mt-4 space-y-2 max-h-72 overflow-y-auto pr-1">
                    {pendingFolders.map((folder) => {
                      const isSelected = selectedPendingFolderPaths.includes(folder.folderPath);
                      return (
                        <button
                          key={folder.folderPath}
                          type="button"
                          onClick={() => handleTogglePendingFolder(folder.folderPath)}
                          disabled={syncing}
                          className={`w-full rounded-xl border p-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                            isSelected
                              ? 'border-[#7d6df7]/50 bg-[#7d6df7]/10 dark:border-[#9b8cff]/50 dark:bg-[#7d6df7]/15'
                              : 'border-slate-200 bg-white hover:border-[#7d6df7]/25 hover:bg-slate-100 dark:border-white/5 dark:bg-[#232938] dark:hover:bg-[#2c3344]'
                          }`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-bold text-slate-800 dark:text-zinc-100">
                                {folder.displayName}
                              </div>
                              <div className="mt-1 truncate text-[11px] text-slate-500 dark:text-zinc-400">
                                {folder.folderPath || 'Root'}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-xs font-bold text-[#6b5ee8] dark:text-[#b7a8ff]">
                                {folder.fileCount} file(s)
                              </div>
                              <div className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
                                {formatBytes(folder.totalBytes)}
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-zinc-400">
                            <span className="rounded-lg bg-emerald-100 px-2 py-1 font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                              updated in 3 days
                            </span>
                            <span>Newest {formatDateTime(folder.newestModifiedTime)}</span>
                          </div>
                          <div className="mt-3 border-l border-slate-200 pl-3 dark:border-white/10">
                            <div className="space-y-1.5">
                              {folder.items.map((item) => (
                                <div
                                  key={item.filePathFromRoot}
                                  className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] dark:bg-[#1b2029]">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <span className="h-px w-3 shrink-0 bg-slate-300 dark:bg-white/20" />
                                    <span className="truncate font-mono text-slate-700 dark:text-zinc-200">
                                      {getRelativeFileLabel(folder.folderPath, item.filePathFromRoot, item.fileName)}
                                    </span>
                                  </div>
                                  <div className="shrink-0 text-slate-400 dark:text-zinc-500">
                                    {typeof item.size === 'number' ? formatBytes(item.size) : formatDateTime(item.modifiedTime || '')}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="px-6 flex gap-3">
            <button
              type="button"
              onClick={() => handleSync('today')}
              disabled={!apiBaseUrl.trim() || !selectedDrive || !localRoot || syncing}
              className="flex-1 px-6 py-3.5 bg-[#7d6df7] hover:bg-[#9387ff] disabled:bg-slate-300 dark:disabled:bg-zinc-700 text-white disabled:text-slate-500 dark:disabled:text-zinc-500 font-bold text-sm rounded-xl transition-all shadow-sm shadow-[#7d6df7]/25 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2">
              {syncing && scope === 'today' ? `Downloading ${progress.downloaded}/${progress.total}` : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m0 0l-5-5m5 5l5-5" />
                  </svg>
                  <span>Sync Today</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => handleSync('all')}
              disabled={!apiBaseUrl.trim() || !selectedDrive || !localRoot || syncing}
              className="flex-1 px-6 py-3.5 bg-[#39435a] hover:bg-[#46506a] disabled:bg-slate-300 dark:disabled:bg-zinc-700 text-white disabled:text-slate-500 dark:disabled:text-zinc-500 font-bold text-sm rounded-xl transition-all shadow-sm shadow-black/10 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2">
              {syncing && scope === 'all' ? `Downloading ${progress.downloaded}/${progress.total}` : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 0113.08-4.95M19.5 12a7.5 7.5 0 01-13.08 4.95M16.5 4.5H18v1.5M6 18H4.5v-1.5" />
                  </svg>
                  <span>Full Sync</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                void handleSyncSelected();
              }}
              disabled={!apiBaseUrl.trim() || !selectedDrive || !localRoot || syncing || selectedPendingFolderPaths.length === 0}
              className="flex-1 px-6 py-3.5 bg-[#39435a] hover:bg-[#46506a] disabled:bg-slate-300 dark:disabled:bg-zinc-700 text-white disabled:text-slate-500 dark:disabled:text-zinc-500 font-bold text-sm rounded-xl transition-all shadow-sm shadow-black/10 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2">
              {syncing && scope === 'selected' ? `Downloading ${progress.downloaded}/${progress.total}` : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75l2.25 2.25L15 9.75M4.5 6.75A2.25 2.25 0 016.75 4.5h10.5a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25H6.75a2.25 2.25 0 01-2.25-2.25V6.75z" />
                  </svg>
                  <span>Sync Selected{selectedPendingFileCount > 0 ? ` (${selectedPendingFileCount})` : ''}</span>
                </>
              )}
            </button>
            {syncing && !paused && (
              <button
                type="button"
                onClick={handlePause}
                className="px-6 py-3.5 bg-red-500 hover:bg-red-600 text-white font-bold text-sm rounded-xl transition-all shadow-sm cursor-pointer flex items-center justify-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75v10.5M15 6.75v10.5" />
                </svg>
                <span>Pause</span>
              </button>
            )}
          </div>

          {syncing && (
            <div className="px-6">
              <div className="bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-600 dark:text-zinc-400">Downloading files...</span>
                <span className="text-xs font-mono text-amber-600 dark:text-amber-400">{progress.downloaded} / {progress.total}</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-zinc-700 rounded-full h-2 overflow-hidden">
                <div className="bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 h-2 animate-pulse bg-[length:200%_100%]" style={{ width: '100%' }} />
              </div>
              </div>
            </div>
          )}

          {skippedFiles.length > 0 && (
            <div className="px-6">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-amber-700 dark:text-amber-300 font-semibold text-sm">
                  Skipped {skippedFiles.length} Google Workspace file(s)
                </span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {skippedFiles.map((file, idx) => (
                  <div key={idx} className="text-xs bg-white dark:bg-zinc-800 border border-amber-200 dark:border-amber-800 rounded-lg p-2">
                    <div className="font-mono text-amber-800 dark:text-amber-200 font-semibold">{file.fileName}</div>
                    <div className="text-slate-500 dark:text-zinc-500 mt-1">{file.path}</div>
                    <div className="text-amber-700 dark:text-amber-300 mt-1">{file.reason}</div>
                  </div>
                ))}
              </div>
              </div>
            </div>
          )}

          {failedFiles.length > 0 && (
            <div className="px-6">
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-red-600 dark:text-red-400 font-semibold text-sm">
                  ⚠️ Failed to download {failedFiles.length} file(s)
                </span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {failedFiles.map((file, idx) => (
                  <div key={idx} className="text-xs bg-white dark:bg-zinc-800 border border-red-200 dark:border-red-800 rounded-lg p-2">
                    <div className="font-mono text-red-700 dark:text-red-300 font-semibold">{file.fileName}</div>
                    <div className="text-slate-500 dark:text-zinc-500 mt-1">{file.path}</div>
                    <div className="text-red-600 dark:text-red-400 mt-1">Error: {file.error}</div>
                  </div>
                ))}
              </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
