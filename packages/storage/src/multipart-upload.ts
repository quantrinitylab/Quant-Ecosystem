import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { Readable } from 'node:stream';
import { StorageConfigSchema, type StorageConfig } from './storage-config.js';

export class MultipartUploader {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: StorageConfig) {
    const validated = StorageConfigSchema.parse(config);
    this.bucket = validated.bucket;
    this.client = new S3Client({
      endpoint: validated.endpoint,
      region: validated.region,
      credentials: {
        accessKeyId: validated.accessKeyId,
        secretAccessKey: validated.secretAccessKey,
      },
      forcePathStyle: validated.forcePathStyle,
    });
  }

  async upload(
    key: string,
    body: Readable,
    contentType: string,
    opts?: { partSize?: number; concurrency?: number },
  ): Promise<{ key: string; etag: string }> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      },
      queueSize: opts?.concurrency ?? 4,
      partSize: opts?.partSize ?? 5 * 1024 * 1024,
    });

    const result = await upload.done();
    return { key, etag: result.ETag ?? '' };
  }
}
