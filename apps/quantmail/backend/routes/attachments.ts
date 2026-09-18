import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { AttachmentService, sanitizeFilename } from '../services/attachment.service';
import {
  DefaultAttachmentScanner,
  type AttachmentScannerPort,
} from '../services/attachment-scanner.service';

export const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Presigned-GET expiry. Deliberately short: the URL bypasses the malware
 * scanner, so its blast radius is bounded by time.
 */
const DOWNLOAD_URL_TTL_SECONDS = 120;

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

const uploadUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(100),
  size: z.number().int().positive(),
});

const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'application/zip',
  'application/gzip',
  'application/x-tar',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'text/html',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  // Audio attachments (Task M26)
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/aac',
  'audio/mp4',
  'audio/m4a',
  'audio/webm',
  'audio/flac',
  // Video attachments (Task M26)
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo',
  'video/mpeg',
]);

const BLOCKED_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.scr',
  '.pif',
  '.vbs',
  '.vbe',
  '.js',
  '.jse',
  '.wsf',
  '.wsh',
  '.msi',
  '.msp',
  '.hta',
  '.cpl',
  '.inf',
]);

function hasBlockedExtension(filename: string): boolean {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return BLOCKED_EXTENSIONS.has(ext);
}

export interface AttachmentRoutesOptions {
  service?: AttachmentService;
  scanner?: AttachmentScannerPort;
}

export default async function attachmentRoutes(
  fastify: FastifyInstance,
  options?: AttachmentRoutesOptions,
) {
  const service = options?.service ?? new AttachmentService({});
  const scanner = options?.scanner ?? new DefaultAttachmentScanner();

  fastify.post('/upload-url', async (request, reply) => {
    const parseResult = uploadUrlSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError(
        `Invalid request: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
        400,
        'VALIDATION_ERROR',
      );
    }

    const userId = requireUserId(request);
    const { filename, contentType, size } = parseResult.data;

    if (size > MAX_ATTACHMENT_SIZE_BYTES) {
      throw createAppError(
        'Attachment exceeds maximum allowed size of 25MB',
        413,
        'ATTACHMENT_TOO_LARGE',
      );
    }

    if (hasBlockedExtension(filename)) {
      throw createAppError('File type not allowed for security reasons', 400, 'BLOCKED_FILE_TYPE');
    }

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw createAppError(
        `Content type "${contentType}" is not supported`,
        400,
        'UNSUPPORTED_CONTENT_TYPE',
      );
    }

    const result = await service.generateUploadUrl(userId, filename, contentType, size);

    return reply.status(200).send({ success: true, data: result });
  });

  // Called by the client after the presigned PUT completes. Verifies the bytes
  // that actually landed in R2/S3 instead of trusting the declared size.
  fastify.post<{ Params: { id: string } }>('/:id/finalize', async (request, reply) => {
    const userId = requireUserId(request);
    const metadata = await service.finalizeUpload(request.params.id, userId);
    return reply.status(200).send({ success: true, data: metadata });
  });

  fastify.get<{ Params: { id: string } }>('/:id/download', async (request, reply) => {
    const userId = requireUserId(request);
    // Real bytes, streamed out of R2/S3 and buffered so the scanner can see
    // the whole object before a single byte reaches the client.
    const { metadata: attachment, body: buffer } = await service.readAttachment(
      request.params.id,
      userId,
    );

    const safeFilename = sanitizeFilename(attachment.filename);

    const scanResult = await scanner.scanBuffer(buffer, safeFilename);
    if (scanResult.isInfected) {
      throw createAppError(
        `Attachment blocked: malware detected (${scanResult.virusName || 'Infected'})`,
        422,
        'MALICIOUS_ATTACHMENT_DETECTED',
      );
    }

    // Enforce Content-Type: application/octet-stream for SVG files to neutralize inline scripts
    const isSvg =
      attachment.contentType.toLowerCase() === 'image/svg+xml' ||
      attachment.contentType.toLowerCase().includes('svg') ||
      safeFilename.toLowerCase().endsWith('.svg');

    const contentType = isSvg
      ? 'application/octet-stream'
      : attachment.contentType || 'application/octet-stream';

    return reply
      .header('Content-Type', contentType)
      .header('Content-Disposition', `attachment; filename="${safeFilename}"`)
      .header('Content-Length', String(buffer.byteLength))
      .header('Content-Security-Policy', "default-src 'none'; sandbox")
      .header('X-Content-Type-Options', 'nosniff')
      .header('X-Frame-Options', 'DENY')
      .send(buffer);
  });

  // Presigned GET for large files. NOTE: this path does not pass through the
  // malware scanner, so it is NOT the default UI download path. The mail client
  // MUST keep using GET /attachments/:id/download (scanned, proxied) for every
  // ordinary download; this route exists only for objects too large to buffer
  // in the API process, and it is gated three ways:
  //   1. ownership is re-checked server-side before signing,
  //   2. the URL lives for DOWNLOAD_URL_TTL_SECONDS (120s), not an hour,
  //   3. the caller must opt in with ?unscanned=true so no client reaches this
  //      route by accident, and the response says so explicitly.
  fastify.get<{ Params: { id: string }; Querystring: { unscanned?: string } }>(
    '/:id/download-url',
    async (request, reply) => {
      const userId = requireUserId(request);

      if (request.query.unscanned !== 'true') {
        throw createAppError(
          'Direct storage URLs skip malware scanning. Pass ?unscanned=true to acknowledge, or use /attachments/:id/download.',
          400,
          'SCAN_BYPASS_NOT_ACKNOWLEDGED',
        );
      }

      const { url, expiresAt, size } = await service.getDownloadUrl(
        request.params.id,
        userId,
        DOWNLOAD_URL_TTL_SECONDS,
      );

      return reply
        .header('Cache-Control', 'no-store')
        .status(200)
        .send({ success: true, data: { url, expiresAt, size, scanned: false } });
    },
  );

  fastify.post<{ Params: { id: string } }>('/:id/scan', async (request, reply) => {
    const userId = requireUserId(request);
    const { metadata: attachment, body: buffer } = await service.readAttachment(
      request.params.id,
      userId,
    );
    const safeFilename = sanitizeFilename(attachment.filename);
    const scanResult = await scanner.scanBuffer(buffer, safeFilename);
    return reply.status(200).send({
      success: true,
      data: {
        ...scanResult,
        id: attachment.id,
        bytesScanned: buffer.byteLength,
      },
    });
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const metadata = await service.getAttachment(request.params.id, userId);
    return reply.send({
      success: true,
      data: {
        id: metadata.id,
        filename: metadata.filename,
        contentType: metadata.contentType,
        size: metadata.size,
        createdAt: metadata.createdAt,
        status: metadata.status,
      },
    });
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const result = await service.deleteAttachment(request.params.id, userId);
    return reply.send({ success: true, data: result });
  });
}
