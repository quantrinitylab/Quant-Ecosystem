import type { StorageClient } from '@quant/storage';

export interface ArtifactResult {
  path: string;
  key: string;
  size: number;
}

export class ArtifactUploader {
  constructor(private readonly storage: StorageClient) {}

  async uploadArtifacts(
    jobId: string,
    paths: string[],
    content: Record<string, Buffer>,
  ): Promise<ArtifactResult[]> {
    const results: ArtifactResult[] = [];

    for (const path of paths) {
      const fileContent = content[path];
      if (!fileContent) {
        continue;
      }

      const key = `ci-artifacts/${jobId}/${path}`;
      await this.storage.upload(key, fileContent, 'application/octet-stream', {
        jobId,
        originalPath: path,
      });

      results.push({
        path,
        key,
        size: fileContent.byteLength,
      });
    }

    return results;
  }

  async getArtifactUrl(key: string): Promise<string> {
    return this.storage.getSignedUrl(key, 3600);
  }
}
