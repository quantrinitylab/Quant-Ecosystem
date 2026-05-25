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

export class StorageClient {
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
