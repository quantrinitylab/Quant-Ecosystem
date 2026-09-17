import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import { AttachmentService, sanitizeFilename } from '../services/attachment.service';
import attachmentRoutes, { MAX_ATTACHMENT_SIZE_BYTES } from '../routes/attachments';
import { EICAR_TEST_SIGNATURE } from '../services/attachment-scanner.service';

describe('AttachmentService & Routes (Wave 15 Track 4: Tasks M24 & M25)', () => {
  let service: AttachmentService;

  beforeEach(() => {
    service = new AttachmentService();
  });

  describe('sanitizeFilename helper', () => {
    it('sanitizes path traversal characters and quotes', () => {
      expect(sanitizeFilename('../../../secret"file".pdf')).toBe('secretfile.pdf');
    });

    it('strips carriage return and line feed characters (CRLF injection prevention)', () => {
      expect(sanitizeFilename('file.pdf\r\nX-Injected: yes\r\n')).toBe('file.pdfX-Injected: yes');
    });

    it('falls back to default filename if input is empty or contains only invalid characters', () => {
      expect(sanitizeFilename('')).toBe('attachment');
      expect(sanitizeFilename('   ')).toBe('attachment');
      expect(sanitizeFilename('///"""')).toBe('attachment');
    });
  });

  describe('AttachmentService unit tests', () => {
    describe('generateUploadUrl', () => {
      it('generates a presigned upload URL', async () => {
        const result = await service.generateUploadUrl(
          'user-1',
          'document.pdf',
          'application/pdf',
          102400,
        );

        expect(result.attachmentId).toMatch(/^att_/);
        expect(result.uploadUrl).toContain('quantmail-attachments');
        expect(result.uploadUrl).toContain('user-1');
        expect(result.expiresAt).toBeInstanceOf(Date);
        expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
      });

      it('rejects files exceeding 25MB', async () => {
        await expect(
          service.generateUploadUrl('user-1', 'huge.zip', 'application/zip', 26 * 1024 * 1024),
        ).rejects.toThrow('exceeds maximum of 25MB');
      });

      it('rejects zero-size files', async () => {
        await expect(
          service.generateUploadUrl('user-1', 'empty.txt', 'text/plain', 0),
        ).rejects.toThrow('greater than 0');
      });

      it('rejects negative-size files', async () => {
        await expect(
          service.generateUploadUrl('user-1', 'neg.txt', 'text/plain', -1),
        ).rejects.toThrow('greater than 0');
      });

      it('rejects empty filename', async () => {
        await expect(service.generateUploadUrl('user-1', '', 'text/plain', 1024)).rejects.toThrow(
          'Filename is required',
        );
      });

      it('sets 15-minute expiry on upload URL', async () => {
        const before = Date.now();
        const result = await service.generateUploadUrl('user-1', 'test.txt', 'text/plain', 1024);
        const after = Date.now();

        const expiryMs = result.expiresAt.getTime();
        expect(expiryMs).toBeGreaterThanOrEqual(before + 15 * 60 * 1000);
        expect(expiryMs).toBeLessThanOrEqual(after + 15 * 60 * 1000 + 100);
      });

      it('generates unique attachment IDs', async () => {
        const r1 = await service.generateUploadUrl('user-1', 'a.txt', 'text/plain', 100);
        const r2 = await service.generateUploadUrl('user-1', 'b.txt', 'text/plain', 200);

        expect(r1.attachmentId).not.toBe(r2.attachmentId);
      });
    });

    describe('getAttachment', () => {
      it('returns attachment metadata with sanitized filename and content details', async () => {
        const result = await service.getAttachment('att_123', 'user-1');

        expect(result.id).toBe('att_123');
        expect(result.userId).toBe('user-1');
        expect(result.url).toContain('att_123');
        expect(result.filename).toBe('document.pdf');
        expect(result.content).toBeDefined();
      });

      it('returns sanitized filename for attachments with unsanitized names', async () => {
        const gen = await service.generateUploadUrl(
          'user-1',
          '../../../malicious"filename".pdf',
          'application/pdf',
          1024,
        );
        const fetched = await service.getAttachment(gen.attachmentId, 'user-1');

        expect(fetched.filename).toBe('maliciousfilename.pdf');
        expect(fetched.content).toBeDefined();
      });

      it('enforces ownership: rejects when requested by non-owner user', async () => {
        const gen = await service.generateUploadUrl(
          'user-owner',
          'private.pdf',
          'application/pdf',
          1024,
        );

        await expect(service.getAttachment(gen.attachmentId, 'user-attacker')).rejects.toThrow(
          'Not authorized to access this attachment',
        );
      });

      it('throws for empty attachment ID', async () => {
        await expect(service.getAttachment('', 'user-1')).rejects.toThrow('Attachment not found');
      });
    });

    describe('deleteAttachment', () => {
      it('deletes an attachment', async () => {
        const result = await service.deleteAttachment('att_123', 'user-1');
        expect(result.deleted).toBe(true);
      });

      it('enforces ownership: rejects delete when requested by non-owner', async () => {
        const gen = await service.generateUploadUrl(
          'user-owner',
          'private.pdf',
          'application/pdf',
          1024,
        );
        await expect(service.deleteAttachment(gen.attachmentId, 'user-attacker')).rejects.toThrow(
          'Not authorized to access this attachment',
        );
      });

      it('throws for empty attachment ID', async () => {
        await expect(service.deleteAttachment('', 'user-1')).rejects.toThrow(
          'Attachment not found',
        );
      });
    });
  });

  describe('Attachment Routes (Fastify Integration: M24 & M25)', () => {
    async function buildAttachmentTestApp(
      authenticatedUserId: string | null = 'user-1',
      injectedService: AttachmentService = service,
    ) {
      const app = Fastify();
      await app.register(errorHandlerPlugin);
      app.addHook('onRequest', async (req) => {
        (req as any).auth = authenticatedUserId ? { userId: authenticatedUserId } : null;
      });
      await app.register(attachmentRoutes, { prefix: '/attachments', service: injectedService });
      return app;
    }

    describe('POST /attachments/upload-url (Task M24)', () => {
      it('rejects unauthenticated callers with 401 UNAUTHORIZED', async () => {
        const app = await buildAttachmentTestApp(null);
        const res = await app.inject({
          method: 'POST',
          url: '/attachments/upload-url',
          payload: {
            filename: 'test.pdf',
            contentType: 'application/pdf',
            size: 1024,
          },
        });

        expect(res.statusCode).toBe(401);
        expect(res.json().error.code).toBe('UNAUTHORIZED');
        await app.close();
      });

      it('rejects attachment size exceeding 25MB with 413 ATTACHMENT_TOO_LARGE', async () => {
        const app = await buildAttachmentTestApp('user-1');
        const res = await app.inject({
          method: 'POST',
          url: '/attachments/upload-url',
          payload: {
            filename: 'huge.pdf',
            contentType: 'application/pdf',
            size: MAX_ATTACHMENT_SIZE_BYTES + 1, // 25MB + 1 byte
          },
        });

        expect(res.statusCode).toBe(413);
        const body = res.json();
        expect(body.error.code).toBe('ATTACHMENT_TOO_LARGE');
        expect(body.error.message).toContain('Attachment exceeds maximum allowed size of 25MB');
        await app.close();
      });

      it('accepts attachment size at boundary (exact 25MB)', async () => {
        const app = await buildAttachmentTestApp('user-1');
        const res = await app.inject({
          method: 'POST',
          url: '/attachments/upload-url',
          payload: {
            filename: 'boundary.pdf',
            contentType: 'application/pdf',
            size: MAX_ATTACHMENT_SIZE_BYTES, // exactly 25MB
          },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().success).toBe(true);
        expect(res.json().data.uploadUrl).toBeDefined();
        await app.close();
      });

      it('rejects blocked file extensions with 400 BLOCKED_FILE_TYPE', async () => {
        const app = await buildAttachmentTestApp('user-1');
        const res = await app.inject({
          method: 'POST',
          url: '/attachments/upload-url',
          payload: {
            filename: 'malware.exe',
            contentType: 'application/pdf',
            size: 1024,
          },
        });

        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe('BLOCKED_FILE_TYPE');
        await app.close();
      });

      it('rejects unsupported MIME types with 400 UNSUPPORTED_CONTENT_TYPE', async () => {
        const app = await buildAttachmentTestApp('user-1');
        const res = await app.inject({
          method: 'POST',
          url: '/attachments/upload-url',
          payload: {
            filename: 'payload.bin',
            contentType: 'application/x-shockwave-flash',
            size: 1024,
          },
        });

        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe('UNSUPPORTED_CONTENT_TYPE');
        await app.close();
      });
    });

    describe('GET /attachments/:id/download (Task M25)', () => {
      it('rejects unauthenticated callers with 401 UNAUTHORIZED', async () => {
        const app = await buildAttachmentTestApp(null);
        const res = await app.inject({
          method: 'GET',
          url: '/attachments/att-123/download',
        });

        expect(res.statusCode).toBe(401);
        expect(res.json().error.code).toBe('UNAUTHORIZED');
        await app.close();
      });

      it('serves PDF with correct CSP sandbox and Content-Disposition headers', async () => {
        const app = await buildAttachmentTestApp('user-1');
        const upload = await service.generateUploadUrl(
          'user-1',
          'financial_report.pdf',
          'application/pdf',
          2048,
        );

        const res = await app.inject({
          method: 'GET',
          url: `/attachments/${upload.attachmentId}/download`,
        });

        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toBe('application/pdf');
        expect(res.headers['content-disposition']).toBe(
          'attachment; filename="financial_report.pdf"',
        );
        expect(res.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-frame-options']).toBe('DENY');
        await app.close();
      });

      it('sanitizes hazardous characters from filename in Content-Disposition', async () => {
        const app = await buildAttachmentTestApp('user-1');
        service.registerAttachment({
          id: 'att-dangerous-1',
          userId: 'user-1',
          filename: '../../../etc/passwd"evil.pdf\r\n',
          contentType: 'application/pdf',
          size: 100,
        });

        const res = await app.inject({
          method: 'GET',
          url: '/attachments/att-dangerous-1/download',
        });

        expect(res.statusCode).toBe(200);
        expect(res.headers['content-disposition']).toBe('attachment; filename="etcpasswdevil.pdf"');
        expect(res.headers['content-disposition']).not.toContain('\r');
        expect(res.headers['content-disposition']).not.toContain('\n');
        expect(res.headers['content-disposition']).not.toContain('/');
        await app.close();
      });

      it('enforces SVG security: forces Content-Type application/octet-stream and CSP sandbox', async () => {
        const app = await buildAttachmentTestApp('user-1');
        const upload = await service.generateUploadUrl(
          'user-1',
          'vector-graphic.svg',
          'image/svg+xml',
          4096,
        );

        const res = await app.inject({
          method: 'GET',
          url: `/attachments/${upload.attachmentId}/download`,
        });

        expect(res.statusCode).toBe(200);
        // S2 invariant: SVG content-type MUST be application/octet-stream so inline scripts cannot execute
        expect(res.headers['content-type']).toBe('application/octet-stream');
        expect(res.headers['content-disposition']).toBe(
          'attachment; filename="vector-graphic.svg"',
        );
        expect(res.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-frame-options']).toBe('DENY');
        await app.close();
      });

      it('validates attachment ownership: rejects access by another user with 403 FORBIDDEN', async () => {
        const app = await buildAttachmentTestApp('user-attacker');
        const upload = await service.generateUploadUrl(
          'user-victim',
          'confidential.pdf',
          'application/pdf',
          1024,
        );

        const res = await app.inject({
          method: 'GET',
          url: `/attachments/${upload.attachmentId}/download`,
        });

        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe('FORBIDDEN');
        await app.close();
      });

      it('Wave 18: permits audio and video mime types for upload url generation', async () => {
        const app = await buildAttachmentTestApp('user-1');

        // Audio
        const audioRes = await app.inject({
          method: 'POST',
          url: '/attachments/upload-url',
          payload: {
            filename: 'voice_memo.mp3',
            contentType: 'audio/mpeg',
            size: 1024 * 1024,
          },
        });
        expect(audioRes.statusCode).toBe(200);
        expect(audioRes.json().success).toBe(true);

        // Video
        const videoRes = await app.inject({
          method: 'POST',
          url: '/attachments/upload-url',
          payload: {
            filename: 'presentation.mp4',
            contentType: 'video/mp4',
            size: 5 * 1024 * 1024,
          },
        });
        expect(videoRes.statusCode).toBe(200);
        expect(videoRes.json().success).toBe(true);

        await app.close();
      });

      it('Wave 18: scans attachment buffer and reports clean file on POST /:id/scan', async () => {
        const app = await buildAttachmentTestApp('user-1');
        const upload = await service.generateUploadUrl(
          'user-1',
          'clean_document.pdf',
          'application/pdf',
          512,
        );

        const scanRes = await app.inject({
          method: 'POST',
          url: `/attachments/${upload.attachmentId}/scan`,
        });

        expect(scanRes.statusCode).toBe(200);
        const data = scanRes.json().data;
        expect(data.isInfected).toBe(false);
        expect(data.engine).toBe('QuantHeuristicScanner');

        await app.close();
      });

      it('Wave 18: blocks infected EICAR attachment download and scan reports virus', async () => {
        const app = await buildAttachmentTestApp('user-1');
        service.registerAttachment({
          id: 'att-eicar-malware',
          userId: 'user-1',
          filename: 'test_virus.txt',
          contentType: 'text/plain',
          size: EICAR_TEST_SIGNATURE.length,
          content: Buffer.from(EICAR_TEST_SIGNATURE),
        });

        // Test POST /:id/scan identifies virus
        const scanRes = await app.inject({
          method: 'POST',
          url: '/attachments/att-eicar-malware/scan',
        });
        expect(scanRes.statusCode).toBe(200);
        expect(scanRes.json().data.isInfected).toBe(true);
        expect(scanRes.json().data.virusName).toBe('EICAR-Test-Signature');

        // Test GET /:id/download blocks download with 422
        const downloadRes = await app.inject({
          method: 'GET',
          url: '/attachments/att-eicar-malware/download',
        });
        expect(downloadRes.statusCode).toBe(422);
        expect(downloadRes.json().error.code).toBe('MALICIOUS_ATTACHMENT_DETECTED');

        await app.close();
      });
    });
  });
});
