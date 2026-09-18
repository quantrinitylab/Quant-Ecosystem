import type { Readable } from 'node:stream';
import { createAppError } from '@quant/server-core';
import { prisma as defaultPrisma } from '@quant/database';
import { StorageClient, resolveStorageConfigFromEnv } from '@quant/storage';

export const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25MB
const UPLOAD_URL_TTL_SECONDS = 15 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

export type AttachmentStatus = 'PENDING' | 'READY' | 'REJECTED';

/**
 * Sanitize filename to prevent directory traversal, CRLF header injection,
 * and quote breakout in Content-Disposition headers.
 */
export function sanitizeFilename(name: string): string {
  if (!name || typeof name !== 'string') {
    return 'attachment';
  }
  const sanitized = name
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/\.\.+/g, '')
    .replace(/[\r\n"\\/]/g, '')
    .trim();

  return sanitized.slice(0, 255) || 'attachment';
}

export function buildStorageKey(userId: string, attachmentId: string, safeName: string): string {
  return `attachments/${userId}/${attachmentId}/${safeName}`;
}

export interface UploadUrlResult {
  attachmentId: string;
  uploadUrl: string;
  method: 'PUT';
  requiredHeaders: Record<string, string>;
  storageKey: string;
  key: string;
  maxBytes: number;
  expiresAt: Date;
}

export interface AttachmentMetadata {
  id: string;
  userId: string;
  emailId: string | null;
  filename: string;
  contentType: string;
  size: number;
  storedSize: number | null;
  storageKey: string;
  status: AttachmentStatus;
  createdAt: Date;
  uploadedAt: Date | null;
}

export interface AttachmentPrismaClient {
  mailAttachment: {
    create(args: any): Promise<any>;
    findUnique(args: any): Promise<any>;
    update(args: any): Promise<any>;
    delete(args: any): Promise<any>;
  };
}

export interface AttachmentServiceOptions {
  storage?: StorageClient;
  db?: AttachmentPrismaClient;
  bucket?: string;
  maxBytes?: number;
}

function toMetadata(row: any): AttachmentMetadata {
  return {
    id: row.id,
    userId: row.userId,
    emailId: row.emailId ?? null,
    filename: sanitizeFilename(row.filename),
    contentType: row.contentType,
    size: row.declaredSize,
    storedSize: row.storedSize ?? null,
    storageKey: row.storageKey,
    status: row.status as AttachmentStatus,
    createdAt: row.createdAt,
    uploadedAt: row.uploadedAt ?? null,
  };
}

async function readToBuffer(stream: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buffer.byteLength;
    if (total > maxBytes) {
      stream.destroy();
      throw createAppError(
        'Attachment exceeds maximum allowed size of 25MB',
        413,
        'ATTACHMENT_TOO_LARGE',
      );
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export class AttachmentService {
  private readonly storage: StorageClient;
  private readonly db: AttachmentPrismaClient;
  private readonly maxBytes: number;

  constructor(options: AttachmentServiceOptions = {}) {
    this.storage = options.storage ?? new StorageClient(resolveStorageConfigFromEnv());
    this.db = options.db ?? (defaultPrisma as unknown as AttachmentPrismaClient);
    this.maxBytes = options.maxBytes ?? MAX_ATTACHMENT_SIZE;
  }

  /** No optional chaining on the delegate: a missing model must fail loudly (W15-3). */
  private rows() {
    const delegate = this.db?.mailAttachment;
    if (!delegate || typeof delegate.create !== 'function') {
      throw createAppError(
        'mail_attachments is not available; run prisma migrate + prisma generate',
        503,
        'STORAGE_UNAVAILABLE',
      );
    }
    return delegate;
  }

  async generateUploadUrl(
    userIdOrOptions:
      | string
      | { userId: string; filename: string; contentType: string; size: number },
    maybeFilename?: string,
    maybeContentType?: string,
    maybeSize?: number,
  ): Promise<UploadUrlResult> {
    let userId: string;
    let filename: string;
    let contentType: string;
    let size: number;

    if (typeof userIdOrOptions === 'object') {
      userId = userIdOrOptions.userId;
      filename = userIdOrOptions.filename;
      contentType = userIdOrOptions.contentType;
      size = userIdOrOptions.size;
    } else {
      userId = userIdOrOptions;
      filename = maybeFilename!;
      contentType = maybeContentType!;
      size = maybeSize!;
    }

    if (size > this.maxBytes) {
      throw createAppError(
        `Attachment size exceeds maximum of 25MB (got ${Math.round(size / 1024 / 1024)}MB)`,
        413,
        'ATTACHMENT_TOO_LARGE',
      );
    }
    if (size <= 0) {
      throw createAppError('Attachment size must be greater than 0', 400, 'INVALID_SIZE');
    }
    if (!filename) {
      throw createAppError('Filename is required', 400, 'INVALID_FILENAME');
    }

    const safeName = sanitizeFilename(filename);
    const attachmentId = `att_${crypto.randomUUID()}`;
    const storageKey = buildStorageKey(userId, attachmentId, safeName);

    const signed = await this.storage.getSignedUploadUrl({
      key: storageKey,
      contentType,
      contentLength: size,
      expiresIn: UPLOAD_URL_TTL_SECONDS,
      maxBytes: this.maxBytes,
      metadata: { 'owner-id': userId, 'attachment-id': attachmentId },
    });

    await this.rows().create({
      data: {
        id: attachmentId,
        userId,
        filename: safeName,
        contentType,
        declaredSize: size,
        storageKey,
        status: 'PENDING',
      },
      select: { id: true },
    });

    return {
      attachmentId,
      uploadUrl: signed.url,
      method: 'PUT',
      requiredHeaders: signed.requiredHeaders,
      storageKey,
      key: storageKey,
      maxBytes: signed.maxBytes,
      expiresAt: signed.expiresAt,
    };
  }

  /**
   * Confirm the bytes actually landed and that the stored object is within the cap.
   * The presigned URL pins the declared size; this verifies reality. An oversized
   * object is deleted rather than left billable and referenceable.
   */
  async finalizeUpload(
    attachmentIdOrArgs: string | { attachmentId: string; userId: string },
    maybeUserId?: string,
  ): Promise<AttachmentMetadata> {
    let attachmentId: string;
    let userId: string;

    if (typeof attachmentIdOrArgs === 'object') {
      attachmentId = attachmentIdOrArgs.attachmentId;
      userId = attachmentIdOrArgs.userId;
    } else {
      attachmentId = attachmentIdOrArgs;
      userId = maybeUserId!;
    }

    const row = await this.requireOwnedRow(attachmentId, userId);
    const storedSize = await this.storage.getObjectSize(row.storageKey);

    if (storedSize === null) {
      throw createAppError('Attachment upload was never completed', 409, 'UPLOAD_INCOMPLETE');
    }

    if (storedSize > this.maxBytes) {
      await this.storage.delete(row.storageKey);
      await this.rows().update({
        where: { id: attachmentId },
        data: { status: 'REJECTED', storedSize },
        select: { id: true },
      });
      throw createAppError(
        'Attachment exceeds maximum allowed size of 25MB',
        413,
        'ATTACHMENT_TOO_LARGE',
      );
    }

    const updated = await this.rows().update({
      where: { id: attachmentId },
      data: { status: 'READY', storedSize, uploadedAt: new Date() },
    });
    return toMetadata(updated);
  }

  async getAttachment(attachmentId: string, userId: string): Promise<AttachmentMetadata> {
    return toMetadata(await this.requireOwnedRow(attachmentId, userId));
  }

  /** Short-lived presigned GET. Bypasses the malware scanner: see route comments. */
  async getDownloadUrl(
    attachmentId: string,
    userId: string,
    ttl = DOWNLOAD_URL_TTL_SECONDS,
  ): Promise<{ url: string; expiresAt: string; size: number }> {
    const row = await this.requireOwnedRow(attachmentId, userId);
    this.assertUploaded(row);
    const url = await this.storage.getSignedUrl(row.storageKey, ttl);
    return {
      url,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      size: (row.storedSize ?? row.declaredSize) as number,
    };
  }

  /** Read the real bytes out of object storage for scanning and inline delivery. */
  async readAttachment(
    attachmentId: string,
    userId: string,
  ): Promise<{ metadata: AttachmentMetadata; body: Buffer }> {
    const row = await this.requireOwnedRow(attachmentId, userId);
    this.assertUploaded(row);
    const object = await this.storage.download(row.storageKey);
    const body = await readToBuffer(object.body, this.maxBytes);
    return { metadata: toMetadata(row), body };
  }

  async deleteAttachment(attachmentId: string, userId: string): Promise<{ deleted: boolean }> {
    const row = await this.requireOwnedRow(attachmentId, userId);
    // Delete bytes first: an orphaned row is recoverable, an orphaned object is billable.
    await this.storage.delete(row.storageKey);
    await this.rows().delete({ where: { id: attachmentId }, select: { id: true } });
    return { deleted: true };
  }

  private async requireOwnedRow(attachmentId: string, userId: string): Promise<any> {
    if (!attachmentId) {
      throw createAppError('Attachment not found', 404, 'ATTACHMENT_NOT_FOUND');
    }
    const row = await this.rows().findUnique({ where: { id: attachmentId } });
    if (!row) {
      throw createAppError('Attachment not found', 404, 'ATTACHMENT_NOT_FOUND');
    }
    if (row.userId !== userId) {
      // Same shape as a miss: do not confirm the existence of another tenant's id.
      throw createAppError('Attachment not found', 404, 'ATTACHMENT_NOT_FOUND');
    }
    return row;
  }

  private assertUploaded(row: { status: string }): void {
    if (row.status !== 'READY') {
      throw createAppError('Attachment upload was never completed', 409, 'UPLOAD_INCOMPLETE');
    }
  }
}
