import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import lfsRoutes from '../routes/lfs.js';
import { LfsHandlerService } from '../services/lfs-handler.js';
import { LfsStorageService } from '@quant/storage';

const sampleOid = 'fb4081c7f9999a4e21a221f7ee5db9dff512e96d92634e8b3941ea50e4fa619d';
const missingOid = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

describe('Git LFS v1 Batch Protocol & Verification', () => {
  let app: FastifyInstance;
  let mockLfsStorage: any;
  let mockAuthService: any;
  let mockRepoStorage: any;
  let lfsHandler: LfsHandlerService;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockLfsStorage = {
      getLfsObjectKey: vi.fn(
        (owner, repo, oid) => `${owner}/${repo}/lfs/${oid.slice(0, 2)}/${oid.slice(2, 4)}/${oid}`,
      ),
      generateLfsUploadUrl: vi.fn().mockResolvedValue({
        uploadUrl: 'https://s3.example.com/upload-lfs-object',
        headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': '1048576' },
        expiresIn: 3600,
      }),
      generateLfsDownloadUrl: vi.fn().mockResolvedValue({
        downloadUrl: 'https://s3.example.com/download-lfs-object',
        expiresIn: 3600,
      }),
      verifyLfsObject: vi.fn().mockImplementation(async (_owner, _repo, oid, expectedSize) => {
        if (oid === sampleOid) {
          return { verified: true, actualSize: expectedSize };
        }
        if (oid === 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff') {
          return { verified: false, actualSize: 500 };
        }
        return { verified: false };
      }),
      objectExists: vi.fn().mockImplementation(async (_owner, _repo, oid) => oid === sampleOid),
    };

    lfsHandler = new LfsHandlerService(
      mockLfsStorage as unknown as LfsStorageService,
      'https://git.quantmail.in',
    );

    mockAuthService = {
      validateToken: vi.fn().mockResolvedValue({
        userId: 'dev-user',
        scopes: ['repo:read', 'repo:write'],
      }),
    };

    mockRepoStorage = {
      repoExists: vi.fn().mockImplementation(async (_owner, repo) => repo === 'my-repo'),
    };

    app = Fastify({ logger: false });
    await app.register(lfsRoutes, {
      lfsHandler,
      authService: mockAuthService,
      repoStorage: mockRepoStorage,
    });
    await app.ready();
  });

  describe('POST /:owner/:repo/info/lfs/objects/batch', () => {
    it('returns upload action and verify action with valid URLs and headers', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/alice/my-repo/info/lfs/objects/batch',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/vnd.git-lfs+json',
        },
        payload: {
          operation: 'upload',
          transfers: ['basic'],
          objects: [{ oid: sampleOid, size: 1048576 }],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/vnd.git-lfs+json');

      const body = JSON.parse(response.body);
      expect(body.transfer).toBe('basic');
      expect(body.objects).toHaveLength(1);

      const obj = body.objects[0];
      expect(obj.oid).toBe(sampleOid);
      expect(obj.size).toBe(1048576);
      expect(obj.actions.upload.href).toBe('https://s3.example.com/upload-lfs-object');
      expect(obj.actions.upload.header['Content-Length']).toBe('1048576');
      expect(obj.actions.upload.expires_in).toBe(3600);
      expect(obj.actions.verify.href).toBe(
        'https://git.quantmail.in/alice/my-repo/info/lfs/objects/verify',
      );
    });

    it('returns download action for existing objects and error for missing objects', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/alice/my-repo/info/lfs/objects/batch',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/vnd.git-lfs+json',
        },
        payload: {
          operation: 'download',
          objects: [
            { oid: sampleOid, size: 1048576 },
            { oid: missingOid, size: 2048 },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.objects).toHaveLength(2);

      // Existing object has download action
      expect(body.objects[0].oid).toBe(sampleOid);
      expect(body.objects[0].actions.download.href).toBe(
        'https://s3.example.com/download-lfs-object',
      );

      // Missing object has error 404
      expect(body.objects[1].oid).toBe(missingOid);
      expect(body.objects[1].error).toEqual({
        code: 404,
        message: 'Object does not exist',
      });
    });

    it('returns 400 when OID is invalid (not 64 hex chars)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/alice/my-repo/info/lfs/objects/batch',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/vnd.git-lfs+json',
        },
        payload: {
          operation: 'upload',
          objects: [{ oid: 'invalid-oid', size: 100 }],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Validation failed');
    });

    it('returns 400 when size is negative', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/alice/my-repo/info/lfs/objects/batch',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/vnd.git-lfs+json',
        },
        payload: {
          operation: 'upload',
          objects: [{ oid: sampleOid, size: -50 }],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 404 when repository does not exist', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/alice/non-existent-repo/info/lfs/objects/batch',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/vnd.git-lfs+json',
        },
        payload: {
          operation: 'upload',
          objects: [{ oid: sampleOid, size: 100 }],
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Repository not found');
    });

    it('returns 401 when no authorization header is provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/alice/my-repo/info/lfs/objects/batch',
        headers: {
          'content-type': 'application/vnd.git-lfs+json',
        },
        payload: {
          operation: 'upload',
          objects: [{ oid: sampleOid, size: 100 }],
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toContain('Basic realm="Git LFS"');
    });

    it('returns 403 when token lacks repo:write for upload', async () => {
      mockAuthService.validateToken.mockResolvedValueOnce({
        userId: 'dev-user',
        scopes: ['repo:read'], // missing repo:write
      });

      const response = await app.inject({
        method: 'POST',
        url: '/alice/my-repo/info/lfs/objects/batch',
        headers: {
          authorization: 'Bearer read-only-token',
          'content-type': 'application/vnd.git-lfs+json',
        },
        payload: {
          operation: 'upload',
          objects: [{ oid: sampleOid, size: 100 }],
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('POST /:owner/:repo/info/lfs/objects/verify', () => {
    it('returns 200 on successful object size verification', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/alice/my-repo/info/lfs/objects/verify',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/vnd.git-lfs+json',
        },
        payload: {
          oid: sampleOid,
          size: 1048576,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({});
    });

    it('returns 422 on object size mismatch', async () => {
      const mismatchOid = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
      const response = await app.inject({
        method: 'POST',
        url: '/alice/my-repo/info/lfs/objects/verify',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/vnd.git-lfs+json',
        },
        payload: {
          oid: mismatchOid,
          size: 1048576,
        },
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('size mismatch');
    });

    it('returns 404 when verified object is not found in storage', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/alice/my-repo/info/lfs/objects/verify',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/vnd.git-lfs+json',
        },
        payload: {
          oid: missingOid,
          size: 1048576,
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('not found');
    });
  });
});
