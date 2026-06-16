import { DriveSyncClient } from './api-client';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join, dirname } from 'path';
import type { ChangeEvent } from './types';

export class FileSync {
  private client: DriveSyncClient;
  private rootMappings: Map<string, string>;

  constructor(
    client: DriveSyncClient,
    rootMappings: Map<string, string>
  ) {
    this.client = client;
    this.rootMappings = rootMappings;
  }

  async handleChange(event: ChangeEvent) {
    const localRoot = this.rootMappings.get(event.rootFolderId);
    if (!localRoot) return;

    const localPath = join(localRoot, event.filePathFromRoot);

    if (event.action === 'deleted') {
      await unlink(localPath).catch(() => {});
      return;
    }

    if (event.action === 'added' || event.action === 'updated') {
      await mkdir(dirname(localPath), { recursive: true });
      const data = await this.client.downloadFile(event.fileId);
      await writeFile(localPath, Buffer.from(data));
    }
  }
}
