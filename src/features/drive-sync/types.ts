export interface WatchFolder {
  rootFolderId: string;
  rootFolderName: string;
  rootFolderPath: string;
  webViewLink: string;
  mentionUserIds: string[];
}

export interface ChangeEvent {
  eventId: string;
  sequence: number;
  occurredAt: string;
  action: 'added' | 'updated' | 'deleted';
  rootFolderId: string;
  rootFolderName: string;
  parentFolderId: string;
  parentFolderName: string;
  parentFolderPathFromRoot: string;
  fileId: string;
  fileName: string;
  filePathFromRoot: string;
  mimeType: string;
  createdTime: string;
  modifiedTime: string;
  size: number;
  webViewLink: string;
}

export interface ChangeFeedResponse {
  ok: true;
  cursor: string;
  nextCursor: string;
  hasMore: boolean;
  items: ChangeEvent[];
}

export interface TreeItem {
  type: 'folder' | 'file';
  folderId?: string;
  folderName?: string;
  fileId?: string;
  fileName?: string;
  pathFromRoot: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: number;
}

export interface TreeSnapshotResponse {
  ok: true;
  rootFolderId: string;
  rootFolderName: string;
  generatedAt: string;
  items: TreeItem[];
}

export interface SyncPlanItem {
  fileId: string;
  fileName: string;
  filePathFromRoot: string;
  parentFolderPathFromRoot: string;
  mimeType: string;
  size: number;
  modifiedTime: string;
  createdTime: string;
  webViewLink: string;
}

export interface SyncPlanResponse {
  ok: true;
  rootFolderId: string;
  rootFolderName: string;
  scope: 'today' | 'all' | 'recent';
  dateKey?: string;
  days?: number;
  timeZone: string;
  totalScannedFiles?: number;
  totalFiles: number;
  totalBytes: number;
  items: SyncPlanItem[];
}

export interface SyncStatusResponse {
  ok: true;
  driveReady: boolean;
  isCheckingDrive: boolean;
  lastSuccessfulCheckTime: string;
  watchedFolderCount: number;
  changeEventCount: number;
}

export interface ReportSyncCompleteRequest {
  syncType: 'today' | 'full' | 'selected';
  rootFolderId: string;
  rootFolderName?: string;
  localPath: string;
  totalFiles?: number;
  totalBytes?: number;
  actorName?: string;
  success?: boolean;
}

export interface ReportSyncCompleteResponse {
  ok: true;
  notified?: boolean;
  skipped?: boolean;
  reason?: string;
  syncType?: string;
}
