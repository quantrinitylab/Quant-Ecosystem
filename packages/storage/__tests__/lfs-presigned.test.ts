import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(function () {
    return { send: mockSend };
  }),
  PutObjectCommand: vi.fn().mockImplementation(function (params) {
    return params;
  }),
  GetObjectCommand: vi.fn().mockImplementation(function (params) {
    return params;
  }),
  DeleteObjectCommand: vi.fn().mockImplementation(function (params) {
    return params;
  }),
  DeleteObjectsCommand: vi.fn().mockImplementation(function (params) {
    return params;
  }),
  ListObjectsV2Command: vi.fn().mockImplementation(function (params) {
    return params;
  }),
  CopyObjectCommand: vi.fn().mockImplementation(function (params) {
    return params;
  }),
  HeadObjectCommand: vi.fn().mockImplementation(function (params) {
    return params;
  }),
  CreateMultipartUploadCommand: vi.fn().mockImplementation(function (params) {
    return params;
  }),
  UploadPartCommand: vi.fn().mockImplementation(function (params) {
    return params;
  }),
  CompleteMultipartUploadCommand: vi.fn().mockImplementation(function (params) {
    return params;
  }),
  AbortMultipartUploadCommand: vi.fn().mockImplementation(function (params) {
    return params;
  }),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-lfs-object'),
}));

import { StorageClient } from '../src/storage-client.js';
import { LfsStorageService } from '../src/lfs.js';
import type { StorageConfig } from '../src/storage-config.js';

const testConfig: StorageConfig = {
  endpoint: 'https://s3.us-east-1.amazonaws.com',
  region: 'us-east-1',
  bucket: 'quant-git-lfs-bucket',
  accessKeyId: 'test-key',
  secretAccessKey: 'test-secret',
};

describe('LfsStorageService', () => {
  let storageClient: StorageClient;
  let lfsService: LfsStorageService;
  const sampleOid = 'fb4081c7f9999a4e21a221f7ee5db9dff512e96d92634e8b3941ea50e4fa619d';

  beforeEach(() => {
    vi.clearAllMocks();
    storageClient = new StorageClient(testConfig);
    lfsService = new LfsStorageService(storageClient);
  });

  describe('getLfsObjectKey', () => {
    it('generates standard Git LFS 2-level directory sharding key', () => {
      const key = lfsService.getLfsObjectKey('alice', 'quant-repo', sampleOid);
      expect(key).toBe(`alice/quant-repo/lfs/fb/40/${sampleOid}`);
    });

    it('strips .git suffix from repo name and handles uppercase owner/repo', () => {
      const key = lfsService.getLfsObjectKey('AliceOrg', 'MyRepo.git', sampleOid);
      expect(key).toBe(`aliceorg/myrepo/lfs/fb/40/${sampleOid}`);
    });

    it('rejects invalid non-64 hex OIDs', () => {
      expect(() => lfsService.getLfsObjectKey('alice', 'repo', 'too-short')).toThrow(
        /Invalid Git LFS OID/,
      );
      expect(() => lfsService.getLfsObjectKey('alice', 'repo', 'g'.repeat(64))).toThrow(
        /Invalid Git LFS OID/,
      );
    });
  });

  describe('generateLfsUploadUrl', () => {
    it('generates presigned PUT URL with required headers and 1-hour expiration', async () => {
      const result = await lfsService.generateLfsUploadUrl(
        'alice',
        'quant-repo',
        sampleOid,
        1048576,
      );

      expect(result.uploadUrl).toBe('https://s3.example.com/presigned-lfs-object');
      expect(result.expiresIn).toBe(3600);
      expect(result.headers['Content-Length']).toBe('1048576');
      expect(result.headers['Content-Type']).toBe('application/octet-stream');
    });
  });

  describe('generateLfsDownloadUrl', () => {
    it('generates presigned GET URL for downloading LFS object', async () => {
      const result = await lfsService.generateLfsDownloadUrl('alice', 'quant-repo', sampleOid);

      expect(result.downloadUrl).toBe('https://s3.example.com/presigned-lfs-object');
      expect(result.expiresIn).toBe(3600);
    });
  });

  describe('verifyLfsObject', () => {
    it('returns verified: true when byte size matches expected size', async () => {
      mockSend.mockResolvedValueOnce({
        ContentLength: 1048576,
        ContentType: 'application/octet-stream',
      });

      const result = await lfsService.verifyLfsObject('alice', 'quant-repo', sampleOid, 1048576);
      expect(result.verified).toBe(true);
      expect(result.actualSize).toBe(1048576);
    });

    it('returns verified: false when byte size mismatches', async () => {
      mockSend.mockResolvedValueOnce({
        ContentLength: 9999,
        ContentType: 'application/octet-stream',
      });

      const result = await lfsService.verifyLfsObject('alice', 'quant-repo', sampleOid, 1048576);
      expect(result.verified).toBe(false);
      expect(result.actualSize).toBe(9999);
    });

    it('returns verified: false when object does not exist (404)', async () => {
      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError);

      const result = await lfsService.verifyLfsObject('alice', 'quant-repo', sampleOid, 1048576);
      expect(result.verified).toBe(false);
    });
  });

  describe('objectExists', () => {
    it('returns true when object exists in storage', async () => {
      mockSend.mockResolvedValueOnce({
        ContentLength: 1048576,
      });

      const exists = await lfsService.objectExists('alice', 'quant-repo', sampleOid);
      expect(exists).toBe(true);
    });

    it('returns false when object is missing', async () => {
      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError);

      const exists = await lfsService.objectExists('alice', 'quant-repo', sampleOid);
      expect(exists).toBe(false);
    });
  });
});
