import { useState, useEffect, useRef } from 'react';
import type { WatchFolder } from '../features/drive-sync/types';
import { useStoredState } from '../hooks/useStoredState';

export function DriveSyncMenu() {
  const [folders, setFolders] = useState<WatchFolder[]>([]);
  const [selectedDrive, setSelectedDrive] = useStoredState<string>('drive-sync-selected-drive', '');
  const [localRoot, setLocalRoot] = useStoredState<string>('drive-sync-local-root', '');
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState({ downloaded: 0, total: 0 });
  const [error, setError] = useState('');
  const [totalFiles, setTotalFiles] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [scope, setScope] = useState<'today' | 'all'>('today');
  const [failedFiles, setFailedFiles] = useState<Array<{ fileName: string; path: string; error: string }>>([]);
  const [paused, setPaused] = useState(false);
  const syncIdRef = useRef(0);

  useEffect(() => {
    window.electronAPI.driveSync.init().then(setFolders).catch(e => setError(e.message));
  }, []);

  const handleSelectFolder = async () => {
    const path = await window.electronAPI.selectFolder();
    if (path) setLocalRoot(path);
  };

  const handleSync = async (syncScope: 'today' | 'all') => {
    console.log('[DriveSyncMenu] handleSync called with scope:', syncScope);
    console.log('[DriveSyncMenu] selectedDrive:', selectedDrive);
    console.log('[DriveSyncMenu] localRoot:', localRoot);

    if (!selectedDrive || !localRoot) return;

    const currentSyncId = ++syncIdRef.current;

    setError('');
    setFailedFiles([]);
    setSyncing(true);
    setPaused(false);
    setProgress({ downloaded: 0, total: 0 });
    setScope(syncScope);

    try {
      console.log('[DriveSyncMenu] Calling getSyncPlan...');
      const plan = await window.electronAPI.driveSync.getSyncPlan(selectedDrive, syncScope);
      console.log('[DriveSyncMenu] getSyncPlan result:', plan);

      if (syncIdRef.current !== currentSyncId) return;

      setTotalFiles(plan.totalFiles);
      setTotalBytes(plan.totalBytes);

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
                Path <span className="text-red-500">*</span>
              </label>
              <div>
                <select
                  value={selectedDrive}
                  onChange={e => setSelectedDrive(e.target.value)}
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
          </div>

          <div className="px-6 flex gap-3">
            <button
              type="button"
              onClick={() => handleSync('today')}
              disabled={!selectedDrive || !localRoot || syncing}
              className="flex-1 px-6 py-3.5 bg-[#39435a] hover:bg-[#46506a] disabled:bg-slate-300 dark:disabled:bg-zinc-700 text-white disabled:text-slate-500 dark:disabled:text-zinc-500 font-bold text-sm rounded-xl transition-all shadow-sm shadow-black/10 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2">
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
              disabled={!selectedDrive || !localRoot || syncing}
              className="flex-1 px-6 py-3.5 bg-[#7d6df7] hover:bg-[#9387ff] disabled:bg-slate-300 dark:disabled:bg-zinc-700 text-white disabled:text-slate-500 dark:disabled:text-zinc-500 font-bold text-sm rounded-xl transition-all shadow-sm shadow-[#7d6df7]/25 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2">
              {syncing && scope === 'all' ? `Downloading ${progress.downloaded}/${progress.total}` : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 0113.08-4.95M19.5 12a7.5 7.5 0 01-13.08 4.95M16.5 4.5h1.5v1.5M6 18H4.5v-1.5" />
                  </svg>
                  <span>Full Sync</span>
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
