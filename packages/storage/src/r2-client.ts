// ============================================================================
// Cloudflare R2 S3-Compatible Client for QuanTube & Media Ecosystem
// ============================================================================
//
// Why Cloudflare R2 over AWS S3 for Video Streaming:
// 1. ZERO EGRESS FEES: AWS S3 charges ~$0.09/GB for data egress to the Internet.
//    A standard 1080p stream at 4.5 Mbps consumes ~2 GB/hour. At 1,000,000 viewer
//    hours/month, AWS S3 bandwidth alone costs ~$180,000/month. On Cloudflare R2,
//    egress bandwidth is $0.00/GB regardless of traffic volume (saving 90%+ on
//    media infrastructure costs).
// 2. EDGE CACHE INTEGRATION: Direct peering with Cloudflare's global CDN cache zone
//    via custom domain (e.g. https://media.quantube.in). HLS media chunks (.ts)
//    are cached edge-side with immutable cache-control headers, achieving sub-30ms
//    video segment delivery globally.
// 3. S3 COMPATIBILITY: Standard SigV4 authentication and S3 API parity allow
//    standard AWS SDK v3 integration with auto-derived R2 endpoints.
// ============================================================================

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl as awsGetSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface CloudflareR2Config {
  /** Cloudflare Account ID (used to auto-derive endpoint) */
  accountId?: string;
  /** Explicit R2 endpoint override (optional, defaults to https://${accountId}.r2.cloudflarestorage.com) */
  endpoint?: string;
  /** R2 Access Key ID */
  accessKeyId?: string;
  /** R2 Secret Access Key */
  secretAccessKey?: string;
  /** Default bucket name (defaults to 'quantube-media-prod') */
  bucket?: string;
  /** Public CDN domain for media streaming (defaults to 'https://media.quantube.in') */
  publicDomain?: string;
}

export interface SignedR2UploadUrl {
  url: string;
  key: string;
  method: 'PUT';
  expiresAt: Date;
  requiredHeaders: Record<string, string>;
  maxBytes: number;
}

export interface UploadHlsResult {
  key: string;
  publicUrl: string;
  contentType: string;
  bytes: number;
}

export interface HlsStreamUrls {
  masterPlaylistUrl: string;
  variantUrls: Record<string, string>;
}

export const DEFAULT_R2_BUCKET = 'quantube-media-prod';
export const DEFAULT_PUBLIC_DOMAIN = 'https://media.quantube.in';
export const DEFAULT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB for raw video uploads

/** Strip trailing slashes from URLs */
function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Check if an S3 error is a 404/NotFound */
function isNotFoundError(error: unknown): boolean {
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
  return candidate?.name === 'NotFound' || candidate?.$metadata?.httpStatusCode === 404;
}

/** Determine MIME type for HLS and media files */
export function getMediaContentType(filePathOrKey: string): string {
  const ext = path.extname(filePathOrKey).toLowerCase();
  switch (ext) {
    case '.m3u8':
      return 'application/vnd.apple.mpegurl';
    case '.ts':
      return 'video/MP2T';
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.m4a':
      return 'audio/mp4';
    case '.mp3':
      return 'audio/mpeg';
    case '.aac':
      return 'audio/aac';
    case '.vtt':
      return 'text/vtt';
    case '.json':
      return 'application/json';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Determine optimal Cache-Control header for Cloudflare CDN edge caching.
 * Video segments (.ts) are immutable and cached forever (31536000s).
 * Playlists (.m3u8) require revalidation or short max-age for adaptive bitrate.
 */
export function getMediaCacheControl(filePathOrKey: string): string {
  const ext = path.extname(filePathOrKey).toLowerCase();
  if (ext === '.ts') {
    // Media segments never mutate: cache at CDN edge and browser forever
    return 'public, max-age=31536000, immutable';
  }
  if (ext === '.m3u8') {
    // VOD playlists can be cached for 24h, live/dynamic playlists revalidate
    return 'public, max-age=86400, stale-while-revalidate=300';
  }
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    // Video thumbnails: cache for 30 days
    return 'public, max-age=2592000, immutable';
  }
  return 'public, max-age=3600';
}

/**
 * Cloudflare R2 S3-Compatible Client for Video Streaming & Media Ecosystem
 */
export class CloudflareR2Client {
  private readonly client: S3Client;
  public readonly accountId: string;
  public readonly bucket: string;
  public readonly publicDomain: string;
  public readonly endpoint: string;

  constructor(config: CloudflareR2Config = {}) {
    const env = process.env;
    this.accountId =
      config.accountId ??
      env['CLOUDFLARE_R2_ACCOUNT_ID'] ??
      env['CLOUDFLARE_ACCOUNT_ID'] ??
      env['R2_ACCOUNT_ID'] ??
      '';

    this.endpoint = stripTrailingSlash(
      config.endpoint ??
        env['CLOUDFLARE_R2_ENDPOINT'] ??
        env['R2_ENDPOINT'] ??
        (this.accountId
          ? `https://${this.accountId}.r2.cloudflarestorage.com`
          : 'https://r2.cloudflarestorage.com'),
    );

    const accessKeyId =
      config.accessKeyId ??
      env['CLOUDFLARE_R2_ACCESS_KEY_ID'] ??
      env['R2_ACCESS_KEY_ID'] ??
      env['S3_ACCESS_KEY'] ??
      '';

    const secretAccessKey =
      config.secretAccessKey ??
      env['CLOUDFLARE_R2_SECRET_ACCESS_KEY'] ??
      env['R2_SECRET_ACCESS_KEY'] ??
      env['S3_SECRET_KEY'] ??
      '';

    this.bucket =
      config.bucket ?? env['CLOUDFLARE_R2_BUCKET'] ?? env['R2_BUCKET'] ?? DEFAULT_R2_BUCKET;

    this.publicDomain = stripTrailingSlash(
      config.publicDomain ??
        env['CLOUDFLARE_R2_PUBLIC_DOMAIN'] ??
        env['R2_PUBLIC_DOMAIN'] ??
        env['MEDIA_PUBLIC_DOMAIN'] ??
        DEFAULT_PUBLIC_DOMAIN,
    );

    const clientConfig: Record<string, unknown> = {
      endpoint: this.endpoint,
      region: 'auto', // R2 requires literal region 'auto'
      credentials: {
        accessKeyId: accessKeyId || 'dummy-access-key',
        secretAccessKey: secretAccessKey || 'dummy-secret-key',
      },
      // Cloudflare R2 works with virtual-host or path-style. Path-style is safest on raw r2 endpoint.
      forcePathStyle: true,
      // Cloudflare R2 rejects AWS SDK's default CRC32 checksum headers on presigned PUTs
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    };

    this.client = new S3Client(clientConfig as never);
  }

  /**
   * Derive public CDN custom domain URL for an object key (e.g. https://media.quantube.in/${key})
   */
  public getPublicUrl(key: string): string {
    const cleanKey = key.replace(/^\/+/, '');
    return `${this.publicDomain}/${cleanKey}`;
  }

  /**
   * Derive full HLS playlist URLs for a transcode output prefix
   */
  public getHlsStreamUrls(
    outputPrefix: string,
    variants: Array<{ name: string } | string> = ['1080p', '720p', '360p'],
  ): HlsStreamUrls {
    const cleanPrefix = outputPrefix.replace(/^\/+|\/+$/g, '');
    const masterPlaylistUrl = this.getPublicUrl(`${cleanPrefix}/master.m3u8`);
    const variantUrls: Record<string, string> = {};

    for (const v of variants) {
      const name = typeof v === 'string' ? v : v.name;
      variantUrls[name] = this.getPublicUrl(`${cleanPrefix}/${name}/playlist.m3u8`);
    }

    return { masterPlaylistUrl, variantUrls };
  }

  /**
   * Presigned PUT URL for direct browser/creator upload to Cloudflare R2.
   * Leverages SigV4 with pinned Content-Length and Content-Type for security.
   */
  public async getSignedUploadUrl(params: {
    key: string;
    contentType: string;
    contentLength: number;
    expiresIn?: number;
    maxBytes?: number;
    metadata?: Record<string, string>;
  }): Promise<SignedR2UploadUrl> {
    const maxBytes = params.maxBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
    if (!Number.isInteger(params.contentLength) || params.contentLength <= 0) {
      throw new Error('contentLength must be a positive integer');
    }
    if (params.contentLength > maxBytes) {
      throw new Error(`contentLength ${params.contentLength} exceeds maxBytes ${maxBytes}`);
    }

    const expiresIn = params.expiresIn ?? 900; // 15 minutes default
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      ContentType: params.contentType,
      ContentLength: params.contentLength,
      Metadata: params.metadata,
      CacheControl: getMediaCacheControl(params.key),
    });

    const url = await awsGetSignedUrl(this.client, command, {
      expiresIn,
      signableHeaders: new Set(['host', 'content-type', 'content-length']),
    });

    return {
      url,
      key: params.key,
      method: 'PUT',
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      requiredHeaders: {
        'Content-Type': params.contentType,
        'Content-Length': String(params.contentLength),
      },
      maxBytes,
    };
  }

  /**
   * Upload an in-memory buffer or readable stream directly to Cloudflare R2
   */
  public async upload(
    key: string,
    body: Buffer | Readable | Uint8Array | string,
    contentType?: string,
    options?: {
      metadata?: Record<string, string>;
      cacheControl?: string;
    },
  ): Promise<{ key: string; etag: string; publicUrl: string }> {
    const inferredContentType = contentType ?? getMediaContentType(key);
    const cacheControl = options?.cacheControl ?? getMediaCacheControl(key);

    const input: PutObjectCommandInput = {
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: inferredContentType,
      CacheControl: cacheControl,
      Metadata: options?.metadata,
    };

    const command = new PutObjectCommand(input);
    const result = await this.client.send(command);

    return {
      key,
      etag: result.ETag ?? '',
      publicUrl: this.getPublicUrl(key),
    };
  }

  /**
   * Upload a file from local disk directly to Cloudflare R2
   */
  public async uploadFile(
    localFilePath: string,
    destinationKey: string,
    contentType?: string,
    cacheControl?: string,
  ): Promise<{ key: string; etag: string; publicUrl: string; bytes: number }> {
    const fileBuffer = await fs.readFile(localFilePath);
    const mimeType = contentType ?? getMediaContentType(localFilePath);
    const cache = cacheControl ?? getMediaCacheControl(localFilePath);

    const result = await this.upload(destinationKey, fileBuffer, mimeType, {
      cacheControl: cache,
    });

    return {
      key: result.key,
      etag: result.etag,
      publicUrl: result.publicUrl,
      bytes: fileBuffer.length,
    };
  }

  /**
   * Upload an entire HLS directory (.m3u8 playlists and .ts segments) to Cloudflare R2.
   * Ensures playlists and media chunks are uploaded with correct MIME types and CDN cache headers.
   */
  public async uploadHlsDirectory(
    localDir: string,
    r2Prefix: string,
    onProgress?: (uploadedCount: number, totalCount: number, currentKey: string) => void,
  ): Promise<UploadHlsResult[]> {
    const cleanPrefix = r2Prefix.replace(/^\/+|\/+$/g, '');
    const results: UploadHlsResult[] = [];

    // Helper to recursively collect all files in the directory
    async function collectFiles(dir: string, baseDir: string): Promise<string[]> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...(await collectFiles(fullPath, baseDir)));
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
      return files;
    }

    const allFiles = await collectFiles(localDir, localDir);
    let uploadedCount = 0;

    for (const filePath of allFiles) {
      // Calculate relative path inside localDir to preserve variant subdirectories
      const relPath = path.relative(localDir, filePath).replace(/\\/g, '/');
      const r2Key = `${cleanPrefix}/${relPath}`;
      const contentType = getMediaContentType(filePath);
      const cacheControl = getMediaCacheControl(filePath);

      const fileData = await fs.readFile(filePath);
      const uploadResult = await this.upload(r2Key, fileData, contentType, {
        cacheControl,
      });

      uploadedCount++;
      if (onProgress) {
        onProgress(uploadedCount, allFiles.length, r2Key);
      }

      results.push({
        key: uploadResult.key,
        publicUrl: uploadResult.publicUrl,
        contentType,
        bytes: fileData.length,
      });
    }

    return results;
  }

  /**
   * Download an object from Cloudflare R2 as a Readable stream
   */
  public async download(
    key: string,
  ): Promise<{ body: Readable; contentType: string; contentLength: number }> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    const result = await this.client.send(command);
    return {
      body: result.Body as Readable,
      contentType: result.ContentType ?? 'application/octet-stream',
      contentLength: result.ContentLength ?? 0,
    };
  }

  /**
   * Get metadata/header info for an object in R2
   */
  public async headObject(key: string): Promise<{
    contentType: string;
    contentLength: number;
    lastModified: Date;
    metadata: Record<string, string>;
  }> {
    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    const result = await this.client.send(command);
    return {
      contentType: result.ContentType ?? 'application/octet-stream',
      contentLength: result.ContentLength ?? 0,
      lastModified: result.LastModified ?? new Date(),
      metadata: result.Metadata ?? {},
    };
  }

  /**
   * Check if an object exists in R2
   */
  public async exists(key: string): Promise<boolean> {
    try {
      await this.headObject(key);
      return true;
    } catch (err) {
      if (isNotFoundError(err)) return false;
      throw err;
    }
  }

  /**
   * Delete an object from Cloudflare R2
   */
  public async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    await this.client.send(command);
  }

  /**
   * Delete multiple objects in a single batch
   */
  public async deleteMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const command = new DeleteObjectsCommand({
      Bucket: this.bucket,
      Delete: {
        Objects: keys.map((k) => ({ Key: k })),
      },
    });
    await this.client.send(command);
  }

  /**
   * Delete all objects under a given prefix
   */
  public async deletePrefix(prefix: string): Promise<number> {
    let deletedCount = 0;
    let continuationToken: string | undefined;

    do {
      const listCommand: ListObjectsV2Command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const response = await this.client.send(listCommand);
      const objects = response.Contents ?? [];
      const keys = objects.map((obj) => obj.Key).filter((k): k is string => Boolean(k));

      if (keys.length > 0) {
        await this.deleteMany(keys);
        deletedCount += keys.length;
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return deletedCount;
  }

  /**
   * List objects with a given prefix
   */
  public async listObjects(
    prefix: string,
    maxKeys = 1000,
  ): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
      MaxKeys: maxKeys,
    });
    const result = await this.client.send(command);
    return (result.Contents ?? []).map((item) => ({
      key: item.Key ?? '',
      size: item.Size ?? 0,
      lastModified: item.LastModified ?? new Date(),
    }));
  }

  /**
   * Copy an object inside the R2 bucket
   */
  public async copy(sourceKey: string, destKey: string): Promise<void> {
    const command = new CopyObjectCommand({
      Bucket: this.bucket,
      CopySource: `${this.bucket}/${sourceKey}`,
      Key: destKey,
    });
    await this.client.send(command);
  }

  /**
   * Presigned GET URL for private downloads
   */
  public async getSignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return awsGetSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * Create an S3/R2 multipart upload session
   */
  public async createMultipartUpload(
    key: string,
    contentType = 'application/octet-stream',
    metadata?: Record<string, string>,
  ): Promise<{ uploadId: string; key: string }> {
    const command = new CreateMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      Metadata: metadata,
      CacheControl: getMediaCacheControl(key),
    });
    const result = await this.client.send(command);
    if (!result.UploadId) {
      throw new Error('Failed to initiate multipart upload: missing UploadId');
    }
    return { uploadId: result.UploadId, key };
  }

  /**
   * Presigned URL for uploading a specific part in a multipart upload
   */
  public async getUploadPartPresignedUrl(params: {
    key: string;
    uploadId: string;
    partNumber: number;
    expiresIn?: number;
  }): Promise<string> {
    const command = new UploadPartCommand({
      Bucket: this.bucket,
      Key: params.key,
      UploadId: params.uploadId,
      PartNumber: params.partNumber,
    });
    return awsGetSignedUrl(this.client, command, {
      expiresIn: params.expiresIn ?? 900,
    });
  }

  /**
   * Complete an R2 multipart upload session
   */
  public async completeMultipartUpload(params: {
    key: string;
    uploadId: string;
    parts: Array<{ partNumber: number; etag: string }>;
  }): Promise<{ key: string; location?: string; etag?: string; publicUrl: string }> {
    const command = new CompleteMultipartUploadCommand({
      Bucket: this.bucket,
      Key: params.key,
      UploadId: params.uploadId,
      MultipartUpload: {
        Parts: params.parts.map((p) => ({
          PartNumber: p.partNumber,
          ETag: p.etag,
        })),
      },
    });
    const result = await this.client.send(command);
    return {
      key: params.key,
      location: result.Location,
      etag: result.ETag,
      publicUrl: this.getPublicUrl(params.key),
    };
  }

  /**
   * Abort an active multipart upload
   */
  public async abortMultipartUpload(params: { key: string; uploadId: string }): Promise<void> {
    const command = new AbortMultipartUploadCommand({
      Bucket: this.bucket,
      Key: params.key,
      UploadId: params.uploadId,
    });
    await this.client.send(command);
  }
}

/**
 * Factory to create Cloudflare R2 client from environment
 */
export function createCloudflareR2Client(config?: CloudflareR2Config): CloudflareR2Client {
  return new CloudflareR2Client(config);
}
