import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl as awsGetSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';
import { StorageConfigSchema, type StorageConfig } from './storage-config.js';

export const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

export interface SignedUploadUrl {
  url: string;
  key: string;
  method: 'PUT';
  expiresAt: Date;
  /**
   * Headers the client MUST send. `Content-Length` is signed, so the browser's
   * automatically-computed value must match byte for byte or SigV4 rejects the
   * request with 403. Do not set Content-Length by hand: it is a forbidden
   * header name in browsers, and the browser already sets it from the body.
   */
  requiredHeaders: Record<string, string>;
  maxBytes: number;
}

function isNotFound(error: unknown): boolean {
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
  return candidate?.name === 'NotFound' || candidate?.$metadata?.httpStatusCode === 404;
}

export class StorageClient {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly provider: StorageConfig['provider'];

  constructor(config: StorageConfig) {
    const validated = StorageConfigSchema.parse(config);
    this.bucket = validated.bucket;
    this.provider = validated.provider;
    const clientConfig: Record<string, unknown> = {
      endpoint: validated.endpoint,
      region: validated.region,
      credentials: {
        accessKeyId: validated.accessKeyId,
        secretAccessKey: validated.secretAccessKey,
      },
      forcePathStyle: validated.forcePathStyle,
    };
    if (validated.provider === 'r2') {
      // Newer AWS SDK builds add CRC32 checksum headers to PutObject by default.
      // Cloudflare R2 rejects those on presigned PUTs. Set via an index signature
      // so this compiles against SDK versions that predate the option.
      clientConfig.requestChecksumCalculation = 'WHEN_REQUIRED';
      clientConfig.responseChecksumValidation = 'WHEN_REQUIRED';
    }
    this.client = new S3Client(clientConfig as never);
  }

  async upload(
    key: string,
    body: Buffer | Readable | string,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<{ key: string; etag: string }> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
    });
    const result = await this.client.send(command);
    return { key, etag: result.ETag ?? '' };
  }

  async download(
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

  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    await this.client.send(command);
  }

  async deleteMany(keys: string[]): Promise<void> {
    const command = new DeleteObjectsCommand({
      Bucket: this.bucket,
      Delete: {
        Objects: keys.map((k) => ({ Key: k })),
      },
    });
    await this.client.send(command);
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return awsGetSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * Presigned PUT for direct browser upload.
   *
   * Size enforcement note: a presigned PUT cannot carry a range limit. S3's
   * POST-policy `content-length-range` would, but Cloudflare R2 does not support
   * presigned POST. So `content-length` is included in the signed headers, which
   * pins the upload to exactly `contentLength` bytes: any other size fails the
   * signature check. Pair this with a post-upload HeadObject to verify the bytes
   * that actually landed.
   */
  async getSignedUploadUrl(params: {
    key: string;
    contentType: string;
    contentLength: number;
    expiresIn?: number;
    maxBytes?: number;
    metadata?: Record<string, string>;
  }): Promise<SignedUploadUrl> {
    const maxBytes = params.maxBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
    if (!Number.isInteger(params.contentLength) || params.contentLength <= 0) {
      throw new Error('contentLength must be a positive integer');
    }
    if (params.contentLength > maxBytes) {
      throw new Error(`contentLength ${params.contentLength} exceeds maxBytes ${maxBytes}`);
    }

    const expiresIn = params.expiresIn ?? 900;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      ContentType: params.contentType,
      ContentLength: params.contentLength,
      Metadata: params.metadata,
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

  /** Actual stored size, or null when the object does not exist. */
  async getObjectSize(key: string): Promise<number | null> {
    try {
      return (await this.headObject(key)).contentLength;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  get providerName(): StorageConfig['provider'] {
    return this.provider;
  }

  async listObjects(
    prefix: string,
    maxKeys?: number,
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

  async copy(sourceKey: string, destKey: string): Promise<void> {
    const command = new CopyObjectCommand({
      Bucket: this.bucket,
      CopySource: `${this.bucket}/${sourceKey}`,
      Key: destKey,
    });
    await this.client.send(command);
  }

  async headObject(key: string): Promise<{
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
}
