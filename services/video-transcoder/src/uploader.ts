// ============================================================================
// Cloudflare R2 / S3 Concurrent Streaming Uploader (Wave 37-02)
// Concurrent stream upload for HLS segments & playlists with CDN caching headers
// and atomic PostgreSQL status updates
// ============================================================================

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createReadStream } from 'node:fs';
import { CloudflareR2Client, createCloudflareR2Client, DEFAULT_R2_BUCKET } from '@quant/storage';

export interface VideoDatabaseClient {
  video: {
    update(args: {
      where: { id: string };
      data: {
        processingStatus?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | string;
        videoUrl?: string;
        updatedAt?: Date;
      };
    }): Promise<unknown>;
  };
}

export interface HlsUploaderOptions {
  r2Client?: CloudflareR2Client;
  bucket?: string;
  concurrency?: number;
  prisma?: VideoDatabaseClient;
}

export interface UploadedFileItem {
  key: string;
  publicUrl: string;
  contentType: string;
  cacheControl: string;
  bytes: number;
}

export interface HlsUploadResult {
  videoId?: string;
  masterManifestUrl: string;
  variantManifestUrls: Record<string, string>;
  uploadedFiles: UploadedFileItem[];
  totalBytes: number;
  uploadedCount: number;
}

/**
 * Determine Cache-Control header strictly according to Wave 37-02 specs:
 * - `.ts` chunks: 'public, max-age=31536000, immutable'
 * - `master.m3u8` and playlists: 'no-cache'
 */
export function getHlsCacheControl(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const base = path.basename(filename).toLowerCase();

  if (ext === '.ts') {
    return 'public, max-age=31536000, immutable';
  }
  if (base === 'master.m3u8' || ext === '.m3u8') {
    return 'no-cache';
  }
  return 'public, max-age=3600';
}

/**
 * Determine MIME content-type for HLS files
 */
export function getHlsContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.m3u8') {
    return 'application/vnd.apple.mpegurl';
  }
  if (ext === '.ts') {
    return 'video/MP2T';
  }
  return 'application/octet-stream';
}

/**
 * Cloudflare R2 / S3 Concurrent Streaming Uploader for HLS Media
 */
export class HlsStorageUploader {
  public readonly r2Client: CloudflareR2Client;
  public readonly concurrency: number;
  public readonly prisma?: VideoDatabaseClient;

  constructor(options: HlsUploaderOptions = {}) {
    this.r2Client =
      options.r2Client ||
      createCloudflareR2Client({
        bucket: options.bucket || process.env.CLOUDFLARE_R2_BUCKET || DEFAULT_R2_BUCKET,
      });
    this.concurrency = Math.max(1, options.concurrency ?? 5);
    this.prisma = options.prisma;
  }

  /**
   * Concurrently stream upload all HLS segments (.ts) and manifests (.m3u8) to R2/S3
   */
  public async uploadHlsDirectory(
    localDir: string,
    outputPrefix: string,
    onProgress?: (uploadedCount: number, totalCount: number, currentKey: string) => void,
  ): Promise<HlsUploadResult> {
    const cleanPrefix = outputPrefix.replace(/^\/+|\/+$/g, '');
    const localDirResolved = path.resolve(localDir);

    // Recursively collect all files in the HLS output directory
    const filesToUpload: Array<{ absolutePath: string; relativePath: string }> = [];

    async function walk(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          const relativePath = path.relative(localDirResolved, fullPath).replace(/\\/g, '/');
          filesToUpload.push({ absolutePath: fullPath, relativePath });
        }
      }
    }

    await walk(localDirResolved);

    const totalCount = filesToUpload.length;
    let uploadedCount = 0;
    const uploadedFiles: UploadedFileItem[] = [];

    // Worker pool for concurrency control
    let fileIndex = 0;
    const uploadWorker = async (): Promise<void> => {
      while (fileIndex < filesToUpload.length) {
        const currentFile = filesToUpload[fileIndex++];
        if (!currentFile) break;

        const r2Key = `${cleanPrefix}/${currentFile.relativePath}`;
        const contentType = getHlsContentType(currentFile.absolutePath);
        const cacheControl = getHlsCacheControl(currentFile.absolutePath);

        const stat = await fs.stat(currentFile.absolutePath);
        const fileStream = createReadStream(currentFile.absolutePath);

        const uploadRes = await this.r2Client.upload(r2Key, fileStream, contentType, {
          cacheControl,
        });

        uploadedCount++;
        uploadedFiles.push({
          key: uploadRes.key,
          publicUrl: uploadRes.publicUrl,
          contentType,
          cacheControl,
          bytes: stat.size,
        });

        if (onProgress) {
          onProgress(uploadedCount, totalCount, r2Key);
        }
      }
    };

    // Execute concurrent upload workers
    const activeWorkers = Array.from(
      { length: Math.min(this.concurrency, filesToUpload.length) },
      () => uploadWorker(),
    );
    await Promise.all(activeWorkers);

    const masterManifestUrl = this.r2Client.getPublicUrl(`${cleanPrefix}/master.m3u8`);
    const variantManifestUrls: Record<string, string> = {};

    for (const f of filesToUpload) {
      if (f.relativePath.endsWith('playlist.m3u8')) {
        const variantName = f.relativePath.split('/')[0] || 'default';
        variantManifestUrls[variantName] = this.r2Client.getPublicUrl(
          `${cleanPrefix}/${f.relativePath}`,
        );
      }
    }

    const totalBytes = uploadedFiles.reduce((acc, f) => acc + f.bytes, 0);

    return {
      masterManifestUrl,
      variantManifestUrls,
      uploadedFiles,
      totalBytes,
      uploadedCount,
    };
  }

  /**
   * Atomically updates video processing status in PostgreSQL from PROCESSING to READY / COMPLETED
   */
  public async updateVideoStatus(
    videoId: string,
    status: 'PROCESSING' | 'READY' | 'COMPLETED' | 'FAILED',
    playbackUrl?: string,
  ): Promise<boolean> {
    if (!this.prisma) {
      return false;
    }

    // Map READY to COMPLETED if Prisma enum requires COMPLETED
    const dbStatus = status === 'READY' ? 'COMPLETED' : status;

    try {
      await this.prisma.video.update({
        where: { id: videoId },
        data: {
          processingStatus: dbStatus,
          ...(playbackUrl ? { videoUrl: playbackUrl } : {}),
          updatedAt: new Date(),
        },
      });
      return true;
    } catch (err) {
      console.warn(
        `[HlsStorageUploader] Failed to update video ${videoId} status:`,
        (err as Error).message,
      );
      return false;
    }
  }

  /**
   * Orchestrates uploading directory and finalizing database status atomically
   */
  public async uploadAndFinalize(
    videoId: string,
    localDir: string,
    outputPrefix?: string,
    onProgress?: (uploadedCount: number, totalCount: number, currentKey: string) => void,
  ): Promise<HlsUploadResult> {
    const prefix = outputPrefix || `videos/${videoId}`;

    // Mark video PROCESSING if database client is configured
    await this.updateVideoStatus(videoId, 'PROCESSING');

    // Perform concurrent streaming upload
    const result = await this.uploadHlsDirectory(localDir, prefix, onProgress);
    result.videoId = videoId;

    // Atomically transition video status to COMPLETED / READY with master playlist playback URL
    await this.updateVideoStatus(videoId, 'READY', result.masterManifestUrl);

    return result;
  }
}
