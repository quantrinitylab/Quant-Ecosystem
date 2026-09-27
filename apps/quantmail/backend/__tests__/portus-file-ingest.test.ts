// @vitest-environment node
/**
 * ============================================================================
 * Portus v1.0.6-Grade Remote URL File Ingestion & Download Token Engine Vitest Suite
 *
 * Verifies industrial remote URL leeching, URL RFC protocol validation, path-derived
 * filename inference, streaming simulation, quota caps, and HMAC-SHA256 time-limited
 * download tokens with IP restrictions, download caps, and instant revocation.
 * ============================================================================
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createUrlIngestJob,
  processUrlIngestJob,
  getIngestJobStatus,
  listIngestJobs,
  generateDownloadToken,
  validateDownloadToken,
  revokeDownloadToken,
  clearRemoteIngestForTesting,
  deriveFileNameFromUrl,
  inferMimeType,
  type RemoteUrlIngestRequest,
  type DownloadTokenConfig,
} from '../services/remote-file-ingest.service';

describe('Portus Remote URL Ingestion & Time-Limited Download Token Engine', () => {
  const TEST_SECRET = 'quant-portus-hmac-master-secret-key-2026';
  const ALT_SECRET = 'different-unauthorized-secret-key';
  const WORKSPACE_ID = 'ws-quant-drive-corp';
  const USER_ID = 'user-arch-007';

  beforeEach(() => {
    clearRemoteIngestForTesting();
  });

  describe('1. Remote URL Ingest Job Creation & URL Protocol Validation', () => {
    it('creates an ingest job with valid https URL and derives filename and MIME type', () => {
      const request: RemoteUrlIngestRequest = {
        workspaceId: WORKSPACE_ID,
        userId: USER_ID,
        sourceUrl: 'https://cdn.example.com/assets/annual-report-2026.pdf',
      };

      const job = createUrlIngestJob(request);

      expect(job.id).toMatch(/^ingest_/);
      expect(job.workspaceId).toBe(WORKSPACE_ID);
      expect(job.userId).toBe(USER_ID);
      expect(job.sourceUrl).toBe('https://cdn.example.com/assets/annual-report-2026.pdf');
      expect(job.fileName).toBe('annual-report-2026.pdf');
      expect(job.mimeType).toBe('application/pdf');
      expect(job.status).toBe('PENDING');
      expect(job.fileSizeBytes).toBe(0);
      expect(job.downloadedBytes).toBe(0);
      expect(job.progressPercentage).toBe(0);
      expect(job.createdAt).toBeDefined();
    });

    it('creates an ingest job with valid http URL and percent-encoded filename', () => {
      const request: RemoteUrlIngestRequest = {
        workspaceId: WORKSPACE_ID,
        userId: USER_ID,
        sourceUrl: 'http://archive.org/files/Q3%20Financial%20Summary.csv?download=true',
      };

      const job = createUrlIngestJob(request);

      expect(job.fileName).toBe('Q3 Financial Summary.csv');
      expect(job.mimeType).toBe('text/csv');
      expect(job.status).toBe('PENDING');
    });

    it('honors customFileName override over derived URL filename', () => {
      const request: RemoteUrlIngestRequest = {
        workspaceId: WORKSPACE_ID,
        userId: USER_ID,
        sourceUrl: 'https://storage.googleapis.com/raw/random-uuid-992138',
        customFileName: 'system_architecture.png',
      };

      const job = createUrlIngestJob(request);

      expect(job.fileName).toBe('system_architecture.png');
      expect(job.mimeType).toBe('image/png');
    });

    it('falls back to default filename when URL path has no leaf filename', () => {
      const request: RemoteUrlIngestRequest = {
        workspaceId: WORKSPACE_ID,
        userId: USER_ID,
        sourceUrl: 'https://example.com/',
      };

      const job = createUrlIngestJob(request);

      expect(job.fileName).toBe('downloaded_file.bin');
      expect(job.mimeType).toBe('application/octet-stream');
    });

    it('rejects unsupported protocols such as ftp, file, and javascript', () => {
      expect(() => {
        createUrlIngestJob({
          workspaceId: WORKSPACE_ID,
          userId: USER_ID,
          sourceUrl: 'ftp://ftp.speedtest.net/100mb.bin',
        });
      }).toThrow(/Unsupported protocol 'ftp:'/);

      expect(() => {
        createUrlIngestJob({
          workspaceId: WORKSPACE_ID,
          userId: USER_ID,
          sourceUrl: 'file:///etc/passwd',
        });
      }).toThrow(/Unsupported protocol 'file:'/);

      expect(() => {
        createUrlIngestJob({
          workspaceId: WORKSPACE_ID,
          userId: USER_ID,
          sourceUrl: 'javascript:alert(1)',
        });
      }).toThrow(/Unsupported protocol 'javascript:'/);
    });

    it('rejects malformed or empty URLs', () => {
      expect(() => {
        createUrlIngestJob({
          workspaceId: WORKSPACE_ID,
          userId: USER_ID,
          sourceUrl: 'not_a_valid_url',
        });
      }).toThrow(/Invalid URL format/);

      expect(() => {
        createUrlIngestJob({
          workspaceId: WORKSPACE_ID,
          userId: USER_ID,
          sourceUrl: '',
        });
      }).toThrow(/sourceUrl is required/);
    });
  });

  describe('2. Ingest Job Processing & State Transitions', () => {
    it('processes ingest job transitioning from PENDING to COMPLETED with 100% progress and fileRecordId', async () => {
      const job = createUrlIngestJob({
        workspaceId: WORKSPACE_ID,
        userId: USER_ID,
        sourceUrl: 'https://cdn.example.com/data/dataset.json',
      });

      expect(getIngestJobStatus(job.id)?.status).toBe('PENDING');

      const completedJob = await processUrlIngestJob(job.id, 5242880, 'application/json');

      expect(completedJob.status).toBe('COMPLETED');
      expect(completedJob.progressPercentage).toBe(100);
      expect(completedJob.fileSizeBytes).toBe(5242880);
      expect(completedJob.downloadedBytes).toBe(5242880);
      expect(completedJob.mimeType).toBe('application/json');
      expect(completedJob.fileRecordId).toMatch(/^file_/);
      expect(completedJob.completedAt).toBeDefined();

      // Verify persistent lookup
      const lookup = getIngestJobStatus(job.id);
      expect(lookup?.status).toBe('COMPLETED');
      expect(lookup?.fileRecordId).toBe(completedJob.fileRecordId);
    });

    it('fails processing when simulated file size exceeds maxSizeBytes quota', async () => {
      const job = createUrlIngestJob({
        workspaceId: WORKSPACE_ID,
        userId: USER_ID,
        sourceUrl: 'https://cdn.example.com/large/iso_image.iso',
        maxSizeBytes: 10485760, // 10 MiB limit
      });

      const failedJob = await processUrlIngestJob(job.id, 52428800); // 50 MiB remote file

      expect(failedJob.status).toBe('FAILED');
      expect(failedJob.error).toContain('exceeds maximum allowed size');
      expect(failedJob.fileRecordId).toBeUndefined();
      expect(failedJob.progressPercentage).not.toBe(100);
    });

    it('throws error when attempting to process a non-existent job ID', async () => {
      await expect(processUrlIngestJob('non-existent-id')).rejects.toThrow(/not found/);
    });

    it('returns existing completed job idempotently if processed again', async () => {
      const job = createUrlIngestJob({
        workspaceId: WORKSPACE_ID,
        userId: USER_ID,
        sourceUrl: 'https://cdn.example.com/test.zip',
      });

      const first = await processUrlIngestJob(job.id, 2048);
      const second = await processUrlIngestJob(job.id, 4096);

      expect(first.fileRecordId).toBe(second.fileRecordId);
      expect(second.fileSizeBytes).toBe(2048);
    });

    it('lists ingest jobs filtered by workspace', async () => {
      createUrlIngestJob({ workspaceId: 'ws-a', userId: 'u1', sourceUrl: 'https://a.com/1.pdf' });
      createUrlIngestJob({ workspaceId: 'ws-a', userId: 'u1', sourceUrl: 'https://a.com/2.pdf' });
      createUrlIngestJob({ workspaceId: 'ws-b', userId: 'u2', sourceUrl: 'https://b.com/3.pdf' });

      expect(listIngestJobs('ws-a').length).toBe(2);
      expect(listIngestJobs('ws-b').length).toBe(1);
      expect(listIngestJobs().length).toBe(3);
    });
  });

  describe('3. HMAC-SHA256 Download Token Generation & Cryptographic Verification', () => {
    it('generates a valid HMAC-signed download token with expiration and downloadUrl', () => {
      const config: DownloadTokenConfig = {
        fileId: 'file-doc-88192',
        workspaceId: WORKSPACE_ID,
        ttlSeconds: 1800, // 30 minutes
        maxDownloads: 5,
        speedLimitKbps: 5120,
      };

      const tokenObj = generateDownloadToken(config, TEST_SECRET);

      expect(tokenObj.token).toBeDefined();
      expect(tokenObj.token.split('.').length).toBe(2);
      expect(tokenObj.fileId).toBe('file-doc-88192');
      expect(tokenObj.downloadUrl).toBe(`/api/drive/download?token=${tokenObj.token}`);
      expect(tokenObj.expiresAt).toBeGreaterThan(Date.now() + 1700 * 1000);
      expect(tokenObj.maxDownloads).toBe(5);
      expect(tokenObj.downloadCount).toBe(0);
      expect(tokenObj.speedLimitKbps).toBe(5120);
      expect(tokenObj.isRevoked).toBe(false);
    });

    it('validates a pristine token successfully and increments downloadCount', () => {
      const config: DownloadTokenConfig = {
        fileId: 'file-clean-123',
        workspaceId: WORKSPACE_ID,
        ttlSeconds: 3600,
        maxDownloads: 3,
      };

      const tokenObj = generateDownloadToken(config, TEST_SECRET);

      const res1 = validateDownloadToken(tokenObj.token, TEST_SECRET);
      expect(res1.valid).toBe(true);
      expect(res1.token?.downloadCount).toBe(1);

      const res2 = validateDownloadToken(tokenObj.token, TEST_SECRET);
      expect(res2.valid).toBe(true);
      expect(res2.token?.downloadCount).toBe(2);
    });

    it('rejects tampered token signature', () => {
      const tokenObj = generateDownloadToken(
        { fileId: 'file-secure-999', workspaceId: WORKSPACE_ID },
        TEST_SECRET,
      );

      const [payload, sig] = tokenObj.token.split('.');
      const tamperedSignature = sig.slice(0, -4) + (sig.endsWith('a') ? 'b' : 'a') + '123';
      const tamperedToken = `${payload}.${tamperedSignature}`;

      const res = validateDownloadToken(tamperedToken, TEST_SECRET);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Invalid or tampered token signature');
    });

    it('rejects token validated with incorrect secret key', () => {
      const tokenObj = generateDownloadToken(
        { fileId: 'file-secure-101', workspaceId: WORKSPACE_ID },
        TEST_SECRET,
      );

      const res = validateDownloadToken(tokenObj.token, ALT_SECRET);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Invalid or tampered token signature');
    });

    it('rejects expired download tokens', () => {
      const tokenObj = generateDownloadToken(
        {
          fileId: 'file-expired-test',
          workspaceId: WORKSPACE_ID,
          ttlSeconds: -10, // already expired 10 seconds ago
        },
        TEST_SECRET,
      );

      const res = validateDownloadToken(tokenObj.token, TEST_SECRET);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Download token has expired');
    });

    it('enforces maximum download limits and rejects subsequent downloads when limit is reached', () => {
      const tokenObj = generateDownloadToken(
        {
          fileId: 'file-capped-downloads',
          workspaceId: WORKSPACE_ID,
          maxDownloads: 2,
        },
        TEST_SECRET,
      );

      // Download 1
      const res1 = validateDownloadToken(tokenObj.token, TEST_SECRET);
      expect(res1.valid).toBe(true);
      expect(res1.token?.downloadCount).toBe(1);

      // Download 2
      const res2 = validateDownloadToken(tokenObj.token, TEST_SECRET);
      expect(res2.valid).toBe(true);
      expect(res2.token?.downloadCount).toBe(2);

      // Download 3 - Should exceed limit
      const res3 = validateDownloadToken(tokenObj.token, TEST_SECRET);
      expect(res3.valid).toBe(false);
      expect(res3.error).toContain('Maximum download limit reached');
    });

    it('allows unlimited downloads when maxDownloads is null', () => {
      const tokenObj = generateDownloadToken(
        {
          fileId: 'file-unlimited',
          workspaceId: WORKSPACE_ID,
          maxDownloads: undefined, // unlimited
        },
        TEST_SECRET,
      );

      for (let i = 1; i <= 10; i++) {
        const res = validateDownloadToken(tokenObj.token, TEST_SECRET);
        expect(res.valid).toBe(true);
        expect(res.token?.downloadCount).toBe(i);
      }
    });

    it('enforces IP restriction when allowedIp is configured', () => {
      const tokenObj = generateDownloadToken(
        {
          fileId: 'file-ip-locked',
          workspaceId: WORKSPACE_ID,
          allowedIp: '192.168.1.100',
        },
        TEST_SECRET,
      );

      // Authorized IP
      const pass = validateDownloadToken(tokenObj.token, TEST_SECRET, '192.168.1.100');
      expect(pass.valid).toBe(true);

      // Unauthorized IP
      const blocked = validateDownloadToken(tokenObj.token, TEST_SECRET, '10.0.0.55');
      expect(blocked.valid).toBe(false);
      expect(blocked.error).toContain('not authorized');

      // Missing client IP when required
      const missingIp = validateDownloadToken(tokenObj.token, TEST_SECRET);
      expect(missingIp.valid).toBe(false);
      expect(missingIp.error).toContain('Client IP address required');
    });

    it('revokes download token immediately and blocks subsequent downloads', () => {
      const tokenObj = generateDownloadToken(
        {
          fileId: 'file-revocation-test',
          workspaceId: WORKSPACE_ID,
        },
        TEST_SECRET,
      );

      // First use succeeds
      const before = validateDownloadToken(tokenObj.token, TEST_SECRET);
      expect(before.valid).toBe(true);

      // Revoke token
      const revoked = revokeDownloadToken(tokenObj.token);
      expect(revoked).toBe(true);

      // Subsequent use fails
      const after = validateDownloadToken(tokenObj.token, TEST_SECRET);
      expect(after.valid).toBe(false);
      expect(after.error).toContain('Download token has been revoked');
    });

    it('returns false when trying to revoke an unknown token', () => {
      expect(revokeDownloadToken('unknown.token')).toBe(false);
    });

    it('handles malformed token strings gracefully in validation', () => {
      expect(validateDownloadToken('', TEST_SECRET).valid).toBe(false);
      expect(validateDownloadToken('no-period-separator', TEST_SECRET).valid).toBe(false);
      expect(validateDownloadToken('a.b.c', TEST_SECRET).valid).toBe(false);
    });
  });

  describe('4. Utility & Inference Helpers', () => {
    it('infers MIME types correctly across standard file extensions', () => {
      expect(inferMimeType('doc.pdf')).toBe('application/pdf');
      expect(inferMimeType('sheet.xlsx')).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(inferMimeType('data.csv')).toBe('text/csv');
      expect(inferMimeType('archive.zip')).toBe('application/zip');
      expect(inferMimeType('photo.webp')).toBe('image/webp');
      expect(inferMimeType('unknown.xyz')).toBe('application/octet-stream');
    });

    it('derives filenames and cleanses special characters safely from URL', () => {
      expect(
        deriveFileNameFromUrl('https://example.com/path/to/archive_file_v2.tar.gz?v=123#hash'),
      ).toBe('archive_file_v2.tar.gz');
      expect(deriveFileNameFromUrl('https://example.com/test%20name.json')).toBe('test name.json');
    });
  });
});
