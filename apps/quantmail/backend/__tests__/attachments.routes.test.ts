import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import attachmentRoutes from '../routes/attachments';
import { AttachmentService } from '../services/attachment.service';
import { FakeStorage, makeDb } from './attachment.service.test';
import type { AttachmentScannerPort, ScanResult } from '../services/attachment-scanner.service';

class FakeScanner implements AttachmentScannerPort {
  infectedPatterns: string[] = ['MALWARE', 'EICAR', 'VIRUS'];

  async scanBuffer(buffer: Buffer, _filename: string): Promise<ScanResult> {
    const text = buffer.toString('utf8');
    for (const pattern of this.infectedPatterns) {
      if (text.includes(pattern)) {
        return {
          isInfected: true,
          virusName: `Detected.${pattern}`,
          scannedAt: new Date(),
          engine: 'FakeScanner',
        };
      }
    }
    return {
      isInfected: false,
      scannedAt: new Date(),
      engine: 'FakeScanner',
    };
  }
}

describe('Attachment Routes (Fastify End-to-End)', () => {
  let storage: FakeStorage;
  let db: ReturnType<typeof makeDb>;
  let service: AttachmentService;
  let scanner: FakeScanner;

  beforeEach(() => {
    storage = new FakeStorage();
    db = makeDb();
    service = new AttachmentService({
      storage: storage as never,
      db: db as never,
      bucket: 'quantmail-attachments',
      maxBytes: 25 * 1024 * 1024,
    });
    scanner = new FakeScanner();
  });

  async function buildApp(authenticatedUserId: string | null = 'user-owner') {
    const app: FastifyInstance = Fastify();
    await app.register(errorHandlerPlugin);
    app.addHook('onRequest', async (req) => {
      (req as any).auth = authenticatedUserId ? { userId: authenticatedUserId } : null;
    });
    await app.register(attachmentRoutes, {
      prefix: '/attachments',
      service,
      scanner,
    });
    return app;
  }

  // -------------------------------------------------------------------------
  // POST /attachments/upload-url
  // -------------------------------------------------------------------------
  describe('POST /attachments/upload-url', () => {
    it('returns signed upload URL and creates PENDING record for valid request', async () => {
      const app = await buildApp('user-owner');
      const res = await app.inject({
        method: 'POST',
        url: '/attachments/upload-url',
        payload: {
          filename: 'contract.pdf',
          contentType: 'application/pdf',
          size: 4096,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.success).toBe(true);
      expect(json.data.attachmentId).toMatch(/^att_/);
      expect(json.data.uploadUrl).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
      expect(json.data.method).toBe('PUT');
      expect(json.data.requiredHeaders['Content-Type']).toBe('application/pdf');

      // Verify row persisted as PENDING
      const row = db.rows.get(json.data.attachmentId);
      expect(row).toBeDefined();
      expect(row?.status).toBe('PENDING');
      expect(row?.declaredSize).toBe(4096);
      await app.close();
    });

    it('rejects unauthenticated request with 401 UNAUTHORIZED', async () => {
      const app = await buildApp(null);
      const res = await app.inject({
        method: 'POST',
        url: '/attachments/upload-url',
        payload: {
          filename: 'notes.txt',
          contentType: 'text/plain',
          size: 100,
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
      await app.close();
    });

    it('rejects files exceeding 25MB with 413 ATTACHMENT_TOO_LARGE', async () => {
      const app = await buildApp('user-owner');
      const res = await app.inject({
        method: 'POST',
        url: '/attachments/upload-url',
        payload: {
          filename: 'huge.zip',
          contentType: 'application/zip',
          size: 25 * 1024 * 1024 + 1,
        },
      });

      expect(res.statusCode).toBe(413);
      expect(res.json().error.code).toBe('ATTACHMENT_TOO_LARGE');
      await app.close();
    });

    it('rejects blocked file extensions with 400 BLOCKED_FILE_TYPE', async () => {
      const app = await buildApp('user-owner');
      const res = await app.inject({
        method: 'POST',
        url: '/attachments/upload-url',
        payload: {
          filename: 'malware.exe',
          contentType: 'application/octet-stream',
          size: 1024,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('BLOCKED_FILE_TYPE');
      await app.close();
    });
  });

  // -------------------------------------------------------------------------
  // POST /attachments/:id/finalize
  // -------------------------------------------------------------------------
  describe('POST /attachments/:id/finalize', () => {
    it('marks attachment READY when bytes have landed in storage', async () => {
      const app = await buildApp('user-owner');
      const upload = await service.generateUploadUrl(
        'user-owner',
        'report.pdf',
        'application/pdf',
        1024,
      );

      // Browser PUT landed in storage
      storage.put(upload.storageKey, Buffer.from('PDF byte stream'), 'application/pdf');

      const res = await app.inject({
        method: 'POST',
        url: `/attachments/${upload.attachmentId}/finalize`,
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('READY');
      expect(json.data.storedSize).toBe(Buffer.from('PDF byte stream').byteLength);
      expect(json.data.uploadedAt).toBeDefined();

      const row = db.rows.get(upload.attachmentId);
      expect(row?.status).toBe('READY');
      await app.close();
    });

    it('rejects with 409 UPLOAD_INCOMPLETE if storage object is missing', async () => {
      const app = await buildApp('user-owner');
      const upload = await service.generateUploadUrl(
        'user-owner',
        'ghost.pdf',
        'application/pdf',
        1024,
      );

      const res = await app.inject({
        method: 'POST',
        url: `/attachments/${upload.attachmentId}/finalize`,
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('UPLOAD_INCOMPLETE');
      await app.close();
    });

    it('rejects and purges oversized object with 413 ATTACHMENT_TOO_LARGE', async () => {
      const app = await buildApp('user-owner');
      const upload = await service.generateUploadUrl(
        'user-owner',
        'bloated.pdf',
        'application/pdf',
        100,
      );

      // Storage has an object exceeding 25MB
      const oversized = Buffer.alloc(26 * 1024 * 1024);
      storage.put(upload.storageKey, oversized, 'application/pdf');

      const res = await app.inject({
        method: 'POST',
        url: `/attachments/${upload.attachmentId}/finalize`,
      });

      expect(res.statusCode).toBe(413);
      expect(res.json().error.code).toBe('ATTACHMENT_TOO_LARGE');

      // Verify purged from storage
      expect(storage.deleted).toContain(upload.storageKey);
      const row = db.rows.get(upload.attachmentId);
      expect(row?.status).toBe('REJECTED');
      await app.close();
    });

    it('rejects unauthorized user with 404 ATTACHMENT_NOT_FOUND (no tenancy enumeration)', async () => {
      const app = await buildApp('user-attacker');
      const upload = await service.generateUploadUrl(
        'user-owner',
        'secret.pdf',
        'application/pdf',
        1024,
      );
      storage.put(upload.storageKey, Buffer.from('secret'), 'application/pdf');

      const res = await app.inject({
        method: 'POST',
        url: `/attachments/${upload.attachmentId}/finalize`,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('ATTACHMENT_NOT_FOUND');
      await app.close();
    });
  });

  // -------------------------------------------------------------------------
  // GET /attachments/:id/download-url
  // -------------------------------------------------------------------------
  describe('GET /attachments/:id/download-url', () => {
    it('requires ?unscanned=true query parameter to acknowledge scan bypass', async () => {
      const app = await buildApp('user-owner');
      const upload = await service.generateUploadUrl(
        'user-owner',
        'doc.pdf',
        'application/pdf',
        500,
      );
      storage.put(upload.storageKey, Buffer.from('doc content'), 'application/pdf');
      await service.finalizeUpload(upload.attachmentId, 'user-owner');

      // Missing ?unscanned=true
      const res = await app.inject({
        method: 'GET',
        url: `/attachments/${upload.attachmentId}/download-url`,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('SCAN_BYPASS_NOT_ACKNOWLEDGED');
      await app.close();
    });

    it('returns presigned download URL when ?unscanned=true is passed', async () => {
      const app = await buildApp('user-owner');
      const upload = await service.generateUploadUrl(
        'user-owner',
        'doc.pdf',
        'application/pdf',
        500,
      );
      storage.put(upload.storageKey, Buffer.from('doc content'), 'application/pdf');
      await service.finalizeUpload(upload.attachmentId, 'user-owner');

      const res = await app.inject({
        method: 'GET',
        url: `/attachments/${upload.attachmentId}/download-url?unscanned=true`,
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.success).toBe(true);
      expect(json.data.url).toContain('X-Amz-Signature=cafebabe');
      expect(json.data.scanned).toBe(false);
      expect(json.data.size).toBe(Buffer.from('doc content').byteLength);
      await app.close();
    });

    it('rejects with 409 UPLOAD_INCOMPLETE if status is still PENDING', async () => {
      const app = await buildApp('user-owner');
      const upload = await service.generateUploadUrl(
        'user-owner',
        'pending.pdf',
        'application/pdf',
        500,
      );

      const res = await app.inject({
        method: 'GET',
        url: `/attachments/${upload.attachmentId}/download-url?unscanned=true`,
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('UPLOAD_INCOMPLETE');
      await app.close();
    });

    it('returns 404 for unauthorized user', async () => {
      const app = await buildApp('user-attacker');
      const upload = await service.generateUploadUrl(
        'user-owner',
        'doc.pdf',
        'application/pdf',
        500,
      );
      storage.put(upload.storageKey, Buffer.from('doc content'), 'application/pdf');
      await service.finalizeUpload(upload.attachmentId, 'user-owner');

      const res = await app.inject({
        method: 'GET',
        url: `/attachments/${upload.attachmentId}/download-url?unscanned=true`,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('ATTACHMENT_NOT_FOUND');
      await app.close();
    });
  });

  // -------------------------------------------------------------------------
  // GET /attachments/:id/download (Proxied + Scanned)
  // -------------------------------------------------------------------------
  describe('GET /attachments/:id/download', () => {
    it('serves file with security headers for clean content', async () => {
      const app = await buildApp('user-owner');
      const upload = await service.generateUploadUrl(
        'user-owner',
        'safe.pdf',
        'application/pdf',
        500,
      );
      const content = Buffer.from('Safe PDF content');
      storage.put(upload.storageKey, content, 'application/pdf');
      await service.finalizeUpload(upload.attachmentId, 'user-owner');

      const res = await app.inject({
        method: 'GET',
        url: `/attachments/${upload.attachmentId}/download`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-disposition']).toBe('attachment; filename="safe.pdf"');
      expect(res.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.body).toBe('Safe PDF content');
      await app.close();
    });

    it('blocks infected attachments with 422 MALICIOUS_ATTACHMENT_DETECTED', async () => {
      const app = await buildApp('user-owner');
      const upload = await service.generateUploadUrl('user-owner', 'eicar.txt', 'text/plain', 500);
      storage.put(
        upload.storageKey,
        Buffer.from('This contains EICAR virus signature'),
        'text/plain',
      );
      await service.finalizeUpload(upload.attachmentId, 'user-owner');

      const res = await app.inject({
        method: 'GET',
        url: `/attachments/${upload.attachmentId}/download`,
      });

      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('MALICIOUS_ATTACHMENT_DETECTED');
      await app.close();
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /attachments/:id
  // -------------------------------------------------------------------------
  describe('DELETE /attachments/:id', () => {
    it('deletes storage object and database row', async () => {
      const app = await buildApp('user-owner');
      const upload = await service.generateUploadUrl(
        'user-owner',
        'temp.pdf',
        'application/pdf',
        500,
      );
      storage.put(upload.storageKey, Buffer.from('temp bytes'), 'application/pdf');
      await service.finalizeUpload(upload.attachmentId, 'user-owner');

      const res = await app.inject({
        method: 'DELETE',
        url: `/attachments/${upload.attachmentId}`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
      expect(storage.deleted).toContain(upload.storageKey);
      expect(db.rows.has(upload.attachmentId)).toBe(false);
      await app.close();
    });
  });
});
