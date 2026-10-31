import * as crypto from 'node:crypto';
import { createAppError } from '@quant/server-core';
import type { SnapMediaExpirer } from './disappearing.service';
import {
  SNAP_NO_STORE_CACHE_CONTROL,
  assertSnapViewUrlShortLived,
  snapViewUrlExpirySeconds,
} from '../lib/media-url';

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
  /**
   * Phase 1B: true once the disappearing sweep expired this snap.
   * Fetches after expiry answer 410 Gone (MEDIA_EXPIRED), never bytes.
   * In-memory today (no durable registry) — a restart clears it.
   */
  expired: boolean;
}

/** Result of a short-lived snap view-URL signing (Phase 1B). */
export interface SnapViewUrlResult {
  mediaId: string;
  /** Simulated signed URL — see note on generateUploadUrl: real S3/R2 presign pending. */
  viewUrl: string;
  expiresAt: Date;
  /** Always 'private, no-store' for snap/story kinds (Phase 1B). */
  cacheControl: string;
  contentDisposition: 'inline';
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

export class MediaService implements SnapMediaExpirer {
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
      expired: false, // Phase 1B: snaps start live.
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

  async getMediaMetadata(mediaId: string, requesterUserId: string): Promise<MediaMetadata> {
    const meta = this.metadata.get(mediaId);
    if (!meta) {
      throw createAppError('Media not found', 404, 'MEDIA_NOT_FOUND');
    }
    // QC-F-031: media metadata (incl. the plain storage URL, which embeds the
    // uploader id and original filename) is owner-only. The data model has
    // no conversation linkage, so there is no member case to honour here.
    if (meta.userId !== requesterUserId) {
      throw createAppError('Only the media owner can access this media', 403, 'NOT_MEDIA_OWNER');
    }
    // Phase 1B: expired snaps answer 410 Gone — after expiry the bytes are
    // gone even for the owner. The owner (403) gate runs first so a
    // non-owner learns nothing new from an expired row.
    if (meta.expired) {
      throw createAppError('Media has expired', 410, 'MEDIA_EXPIRED');
    }
    return meta;
  }

  /**
   * SnapMediaExpirer port (Phase 1B). SYSTEM-ONLY: called by the
   * disappearing sweep worker — never exposed on a route. Marks the media
   * expired so later fetches answer 410 Gone. Unknown ids are ignored
   * (already gone). No owner gate here: the worker is not an owner.
   */
  async expireSnapMedia(mediaId: string): Promise<void> {
    const meta = this.metadata.get(mediaId);
    if (!meta) return;
    meta.expired = true;
  }

  /**
   * Owner-visible expiry marker. Prefer expireSnapMedia() (system) — this
   * is the owner-gated convenience for any future user-facing "expire my
   * snap" surface.
   */
  async markSnapMediaExpired(mediaId: string, requesterUserId: string): Promise<void> {
    const meta = this.metadata.get(mediaId);
    if (!meta) {
      throw createAppError('Media not found', 404, 'MEDIA_NOT_FOUND');
    }
    if (meta.userId !== requesterUserId) {
      throw createAppError('Only the media owner can access this media', 403, 'NOT_MEDIA_OWNER');
    }
    await this.expireSnapMedia(mediaId);
  }

  /**
   * Short-lived signed view URL for snap/story media (Phase 1B).
   *
   * - Expiry: SNAP_VIEW_URL_EXPIRY_SECONDS env, default 15 minutes; hard
   *   cap enforced by assertSnapViewUrlShortLived.
   * - Cache: the issued URL must NEVER be stored or served with long/
   *   permanent CDN cache headers — cacheControl is 'private, no-store'
   *   and callers must apply snapMediaResponseHeaders() on the response.
   * - 410: an expired snap answers 410 Gone via getMediaMetadata.
   *
   * Signing is simulated (same honesty note as generateUploadUrl): the
   * token is an opaque random value; real S3/R2 presigned-URL signing is
   * pending. Recipient (non-owner) view grants are a TODO pending the
   * media→conversation linkage the data model lacks (QC-F-031 owner gate).
   */
  async generateSnapViewUrl(
    mediaId: string,
    requesterUserId: string,
  ): Promise<SnapViewUrlResult> {
    const meta = await this.getMediaMetadata(mediaId, requesterUserId);

    const expiresIn = snapViewUrlExpirySeconds();
    assertSnapViewUrlShortLived(expiresIn, 'snap');

    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    const token = crypto.randomBytes(16).toString('hex');
    const viewUrl =
      `${meta.url}?snap_view=1&expires=${Math.floor(expiresAt.getTime() / 1000)}` +
      `&token=${token}`;

    return {
      mediaId,
      viewUrl,
      expiresAt,
      cacheControl: SNAP_NO_STORE_CACHE_CONTROL,
      contentDisposition: 'inline',
    };
  }

  async deleteMedia(mediaId: string, requesterUserId: string): Promise<void> {
    const meta = this.metadata.get(mediaId);
    if (!meta) {
      throw createAppError('Media not found', 404, 'MEDIA_NOT_FOUND');
    }
    // QC-F-031 (§4.4 hardening): no DELETE route wires this yet, but the
    // signature is owner-gated now so a future route is fail-closed by
    // construction instead of inheriting the old unchecked pattern.
    if (meta.userId !== requesterUserId) {
      throw createAppError('Only the media owner can access this media', 403, 'NOT_MEDIA_OWNER');
    }
    this.metadata.delete(mediaId);
  }
}

