import { createAppError } from '@quant/server-core';

const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25MB

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
}

export class AttachmentService {
  private readonly bucket: string;

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
        400,
        'ATTACHMENT_TOO_LARGE',
      );
    }

    if (size <= 0) {
      throw createAppError('Attachment size must be greater than 0', 400, 'INVALID_SIZE');
    }

    if (!filename) {
      throw createAppError('Filename is required', 400, 'INVALID_FILENAME');
    }

    const attachmentId = `att_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
    const key = `${userId}/${attachmentId}/${filename}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min expiry

    // Generate presigned S3-style URL
    const uploadUrl = `https://${this.bucket}.s3.amazonaws.com/${key}?X-Amz-Expires=900&X-Amz-SignedHeaders=content-type`;

    return {
      uploadUrl,
      attachmentId,
      expiresAt,
    };
  }

  async getAttachment(attachmentId: string, userId: string): Promise<AttachmentMetadata> {
    // In a real implementation, this would query a database
    // Here we return structured metadata
    if (!attachmentId) {
      throw createAppError('Attachment not found', 404, 'ATTACHMENT_NOT_FOUND');
    }

    return {
      id: attachmentId,
      userId,
      filename: 'document.pdf',
      contentType: 'application/pdf',
      size: 1024,
      url: `https://${this.bucket}.s3.amazonaws.com/${userId}/${attachmentId}/document.pdf`,
      createdAt: new Date(),
    };
  }

  async deleteAttachment(attachmentId: string, userId: string): Promise<{ deleted: boolean }> {
    if (!attachmentId) {
      throw createAppError('Attachment not found', 404, 'ATTACHMENT_NOT_FOUND');
    }

    // In a real implementation, this would delete from S3 and database
    return { deleted: true };
  }
}
