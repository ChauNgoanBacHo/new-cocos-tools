import type { WatchFolder, ChangeFeedResponse, TreeSnapshotResponse, SyncPlanResponse, SyncStatusResponse, ReportSyncCompleteRequest, ReportSyncCompleteResponse } from './types';

const REQUEST_TIMEOUT_MS = 45000;

export class DriveSyncClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl: string, apiKey?: string) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.apiKey = apiKey;
  }

  setBaseUrl(baseUrl: string) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  private async fetch<T>(path: string): Promise<T> {
    const headers = this.createHeaders();
    const url = `${this.baseUrl}${path}`;
    console.log('[DriveSyncClient] Fetching:', url, 'headers:', headers);
    const res = await fetchWithTimeout(url, { headers });
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

  async getRecentSyncPlan(rootFolderId: string, days = 3): Promise<SyncPlanResponse> {
    const params = new URLSearchParams({
      rootFolderId,
      days: String(days),
    });
    return this.fetch(`/api/drive/recent-sync-plan?${params}`);
  }

  async getSyncStatus(): Promise<SyncStatusResponse> {
    return this.fetch('/api/drive/sync-status');
  }

  async getTreeSnapshot(rootFolderId: string): Promise<TreeSnapshotResponse> {
    return this.fetch(`/api/drive/tree?rootFolderId=${rootFolderId}`);
  }

  async downloadFile(fileId: string): Promise<ArrayBuffer> {
    const headers = this.createHeaders();
    const res = await fetchWithTimeout(`${this.baseUrl}/api/drive/files/${fileId}/download`, { headers });
    if (!res.ok) throw new Error(`Download error: ${res.status}`);
    return res.arrayBuffer();
  }

  async reportSyncComplete(payload: ReportSyncCompleteRequest): Promise<ReportSyncCompleteResponse> {
    const headers = this.createHeaders({ 'Content-Type': 'application/json' });
    console.log('[DriveSyncClient] Reporting sync complete:', payload);
    const res = await fetchWithTimeout(`${this.baseUrl}/api/drive/sync-complete`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`Report error: ${res.status}`);
    const data = await res.json();
    console.log('[DriveSyncClient] Report response:', data);
    return data;
  }

  private createHeaders(extraHeaders: Record<string, string> = {}) {
    const headers: Record<string, string> = { ...extraHeaders };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
      headers['x-internal-api-key'] = this.apiKey;
    }
    return headers;
  }
}

function normalizeBaseUrl(baseUrl: string) {
  const normalized = String(baseUrl || '').trim().replace(/[),.;\s]+$/, '').replace(/\/+$/, '');
  if (!normalized) {
    throw new Error('Drive API URL is required');
  }

  const url = new URL(normalized);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Drive API URL must start with http:// or https://');
  }

  return normalized;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`API request timed out after ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
