import type { WatchFolder, ChangeFeedResponse, TreeSnapshotResponse, SyncPlanResponse, SyncStatusResponse } from './types';

export class DriveSyncClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl: string, apiKey?: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  private async fetch<T>(path: string): Promise<T> {
    const headers: Record<string, string> = {};
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
    const url = `${this.baseUrl}${path}`;
    console.log('[DriveSyncClient] Fetching:', url, 'headers:', headers);
    const res = await fetch(url, { headers });
    console.log('[DriveSyncClient] Response status:', res.status);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();
    console.log('[DriveSyncClient] Response data:', data);
    return data;
  }

  async getWatchFolders(): Promise<WatchFolder[]> {
    const data = await this.fetch<{ ok: true; items: WatchFolder[] }>('/api/drive/watch-folders');
    return data.items;
  }

  async getChanges(cursor?: string, limit = 100): Promise<ChangeFeedResponse> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.fetch(`/api/drive/changes?${params}`);
  }

  async getSyncPlan(rootFolderId: string, scope: 'today' | 'all' = 'today'): Promise<SyncPlanResponse> {
    return this.fetch(`/api/drive/sync-plan?rootFolderId=${rootFolderId}&scope=${scope}`);
  }

  async getSyncStatus(): Promise<SyncStatusResponse> {
    return this.fetch('/api/drive/sync-status');
  }

  async getTreeSnapshot(rootFolderId: string): Promise<TreeSnapshotResponse> {
    return this.fetch(`/api/drive/tree?rootFolderId=${rootFolderId}`);
  }

  async downloadFile(fileId: string): Promise<ArrayBuffer> {
    const headers: Record<string, string> = {};
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
    const res = await fetch(`${this.baseUrl}/api/drive/files/${fileId}/download`, { headers });
    if (!res.ok) throw new Error(`Download error: ${res.status}`);
    return res.arrayBuffer();
  }
}
