import * as crypto from 'node:crypto';
import { createAppError } from '@quant/server-core';

export interface PresignedUploadResult {
  uploadUrl: string;
  mediaId: string;
  expiresAt: Date;
  fields: Record<string, string>;
}

export interface MediaMetadata {
  mediaId: string;
  userId: string;
  filename: string;
  contentType: string;
  uploadedAt: Date;
  url: string;
}

export interface MediaStorageConfig {
  bucket: string;
  region: string;
  baseUrl: string;
  uploadExpiry: number; // seconds
}

const DEFAULT_CONFIG: MediaStorageConfig = {
  bucket: process.env['S3_BUCKET'] ?? 'quantchat-media',
  region: process.env['S3_REGION'] ?? 'us-east-1',
  baseUrl: process.env['S3_BASE_URL'] ?? 'https://quantchat-media.s3.amazonaws.com',
  uploadExpiry: 3600,
};

export class MediaService {
  private metadata: Map<string, MediaMetadata> = new Map();
  private config: MediaStorageConfig;

  constructor(config?: Partial<MediaStorageConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async generateUploadUrl(
    userId: string,
    filename: string,
    contentType: string,
  ): Promise<PresignedUploadResult> {
    if (!filename || !contentType) {
      throw createAppError('Filename and content type are required', 400, 'INVALID_INPUT');
    }

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/webm',
      'audio/mpeg',
      'audio/ogg',
      'application/pdf',
    ];

    if (!allowedTypes.includes(contentType)) {
      throw createAppError(
        `Content type "${contentType}" is not allowed`,
        400,
        'INVALID_CONTENT_TYPE',
      );
    }

    const mediaId = `media_${crypto.randomUUID()}`;
    const key = `${userId}/${mediaId}/${filename}`;
    const expiresAt = new Date(Date.now() + this.config.uploadExpiry * 1000);

    // Generate a presigned URL structure (simulated, real implementation uses AWS SDK)
    const uploadUrl = `${this.config.baseUrl}/${key}?X-Amz-Expires=${this.config.uploadExpiry}`;

    const meta: MediaMetadata = {
      mediaId,
      userId,
      filename,
      contentType,
      uploadedAt: new Date(),
      url: `${this.config.baseUrl}/${key}`,
    };
    this.metadata.set(mediaId, meta);

    return {
      uploadUrl,
      mediaId,
      expiresAt,
      fields: {
        key,
        'Content-Type': contentType,
        bucket: this.config.bucket,
      },
    };
  }

  async getMediaMetadata(mediaId: string): Promise<MediaMetadata> {
    const meta = this.metadata.get(mediaId);
    if (!meta) {
      throw createAppError('Media not found', 404, 'MEDIA_NOT_FOUND');
    }
    return meta;
  }

  async deleteMedia(mediaId: string): Promise<void> {
    const meta = this.metadata.get(mediaId);
    if (!meta) {
      throw createAppError('Media not found', 404, 'MEDIA_NOT_FOUND');
    }
    this.metadata.delete(mediaId);
  }
}
