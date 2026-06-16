import { DriveSyncClient } from './api-client';
import type { ChangeEvent } from './types';

export class DriveSyncPoller {
  private client: DriveSyncClient;
  private onChanges: (events: ChangeEvent[]) => void;
  private pollIntervalMs: number;
  private cursor?: string;
  private intervalId?: NodeJS.Timeout;

  constructor(
    client: DriveSyncClient,
    onChanges: (events: ChangeEvent[]) => void,
    pollIntervalMs = 30000
  ) {
    this.client = client;
    this.onChanges = onChanges;
    this.pollIntervalMs = pollIntervalMs;
  }

  start() {
    if (this.intervalId) return;
    this.poll();
    this.intervalId = setInterval(() => this.poll(), this.pollIntervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  private async poll() {
    try {
      const res = await this.client.getChanges(this.cursor);
      if (res.items.length > 0) {
        this.onChanges(res.items);
      }
      this.cursor = res.nextCursor;
      if (res.hasMore) this.poll();
    } catch (err) {
      console.error('Poll error:', err);
    }
  }
}
