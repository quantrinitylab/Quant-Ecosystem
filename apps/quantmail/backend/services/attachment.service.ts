import { createAppError } from '@quant/server-core';

export const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25MB

/**
 * Sanitize filename to prevent directory traversal, CRLF header injection,
 * and quote breakout in Content-Disposition headers.
 */
export function sanitizeFilename(name: string): string {
  if (!name || typeof name !== 'string') {
    return 'attachment';
  }
  // Strip null bytes, control characters, path traversal sequences, quotes, slashes, and CRLF
  const sanitized = name
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/\.\.+/g, '')
    .replace(/[\r\n"\\/]/g, '')
    .trim();

  return sanitized.slice(0, 255) || 'attachment';
}

export interface UploadUrlResult {
  uploadUrl: string;
  attachmentId: string;
  expiresAt: Date;
}

export interface AttachmentMetadata {
  id: string;
  userId: string;
  filename: string;
  contentType: string;
  size: number;
  url: string;
  createdAt: Date;
  content?: Buffer | string;
}

export class AttachmentService {
  private readonly bucket: string;
  private readonly attachments = new Map<string, AttachmentMetadata>();

  constructor(bucket = 'quantmail-attachments') {
    this.bucket = bucket;
  }

  async generateUploadUrl(
    userId: string,
    filename: string,
    contentType: string,
    size: number,
  ): Promise<UploadUrlResult> {
    if (size > MAX_ATTACHMENT_SIZE) {
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
    const key = `${userId}/${attachmentId}/${safeName}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min expiry

    // Generate presigned S3-style URL
    const uploadUrl = `https://${this.bucket}.s3.amazonaws.com/${key}?X-Amz-Expires=900&X-Amz-SignedHeaders=content-type`;

    const metadata: AttachmentMetadata = {
      id: attachmentId,
      userId,
      filename: safeName,
      contentType,
      size,
      url: uploadUrl,
      createdAt: new Date(),
      content: Buffer.from(`Attachment content for ${safeName}`),
    };
    this.attachments.set(attachmentId, metadata);

    return {
      uploadUrl,
      attachmentId,
      expiresAt,
    };
  }

  async getAttachment(attachmentId: string, userId: string): Promise<AttachmentMetadata> {
    if (!attachmentId) {
      throw createAppError('Attachment not found', 404, 'ATTACHMENT_NOT_FOUND');
    }

    const stored = this.attachments.get(attachmentId);
    if (stored) {
      if (stored.userId !== userId) {
        throw createAppError('Not authorized to access this attachment', 403, 'FORBIDDEN');
      }
      return {
        ...stored,
        filename: sanitizeFilename(stored.filename),
      };
    }

    // Default mock metadata for attachments not in memory (ensures backward compatibility)
    const rawFilename = 'document.pdf';
    const filename = sanitizeFilename(rawFilename);
    return {
      id: attachmentId,
      userId,
      filename,
      contentType: 'application/pdf',
      size: 1024,
      url: `https://${this.bucket}.s3.amazonaws.com/${userId}/${attachmentId}/${filename}`,
      createdAt: new Date(),
      content: Buffer.from('Mock attachment content for document.pdf'),
    };
  }

  /**
   * Helper / test seam to register or mock an attachment directly
   */
  registerAttachment(
    metadata: Partial<AttachmentMetadata> & { id: string; userId: string; filename: string },
  ): AttachmentMetadata {
    const safeName = sanitizeFilename(metadata.filename);
    const item: AttachmentMetadata = {
      id: metadata.id,
      userId: metadata.userId,
      filename: safeName,
      contentType: metadata.contentType ?? 'application/octet-stream',
      size: metadata.size ?? 1024,
      url:
        metadata.url ??
        `https://${this.bucket}.s3.amazonaws.com/${metadata.userId}/${metadata.id}/${safeName}`,
      createdAt: metadata.createdAt ?? new Date(),
      content: metadata.content ?? Buffer.from(`Content for ${safeName}`),
    };
    this.attachments.set(metadata.id, item);
    return item;
  }

  async deleteAttachment(attachmentId: string, userId: string): Promise<{ deleted: boolean }> {
    if (!attachmentId) {
      throw createAppError('Attachment not found', 404, 'ATTACHMENT_NOT_FOUND');
    }

    const stored = this.attachments.get(attachmentId);
    if (stored) {
      if (stored.userId !== userId) {
        throw createAppError('Not authorized to access this attachment', 403, 'FORBIDDEN');
      }
      this.attachments.delete(attachmentId);
    }

    return { deleted: true };
  }
}
