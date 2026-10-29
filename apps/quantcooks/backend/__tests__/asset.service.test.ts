// ============================================================================
// AssetService tests (P0-3 port).
//
// The 6 original cases (upload/list/get×2/delete×2) plus P0-2's 3 listAll
// cases, ported from the in-memory service to the Prisma-backed one over
// the fake EditAsset delegate + fake StoragePort — same assertions, same
// error messages/codes. New coverage for what shipped untested before
// (flag F8): the signed-upload flow end to end — PENDING row first,
// deterministic key, HeadObject-verified completion, the 409s, the 503,
// the 413, cross-user 404s, byte cleanup on delete, and cross-instance
// persistence. A grep guard pins the fabricated domain out of the backend.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AssetService } from '../services/asset.service';
import { createFakeEditAssetPrisma, type FakeEditAssetPrisma } from './fake-edit-asset-prisma';
import { createFakeStorage, FAKE_STORAGE_HOST, type FakeStorage } from './fake-storage';

const USER = 'user-1';

describe('AssetService', () => {
  let prisma: FakeEditAssetPrisma;
  let storage: FakeStorage;
  let service: AssetService;

  beforeEach(() => {
    prisma = createFakeEditAssetPrisma();
    storage = createFakeStorage();
    service = new AssetService(prisma, storage.port);
  });

  describe('uploadAsset', () => {
    it('creates an asset and returns it', async () => {
      const asset = await service.uploadAsset({
        userId: USER,
        projectId: 'project-1',
        filename: 'clip.mp4',
        type: 'video',
        size: 50000000,
      });

      expect(asset.projectId).toBe('project-1');
      expect(asset.filename).toBe('clip.mp4');
      expect(asset.type).toBe('video');
      expect(asset.size).toBe(50000000);
      // Metadata-only create: PENDING, no URL, no storage key.
      expect(asset.uploadStatus).toBe('PENDING');
      expect(asset.url).toBeNull();
      expect(asset.storageKey).toBeNull();
    });
  });

  describe('listAssets', () => {
    it('returns assets for a project', async () => {
      await service.uploadAsset({
        userId: USER,
        projectId: 'project-1',
        filename: 'clip1.mp4',
        type: 'video',
        size: 50000000,
      });
      await service.uploadAsset({
        userId: USER,
        projectId: 'project-1',
        filename: 'clip2.mp4',
        type: 'video',
        size: 30000000,
      });
      await service.uploadAsset({
        userId: USER,
        projectId: 'project-2',
        filename: 'other.mp4',
        type: 'video',
        size: 10000000,
      });

      const assets = await service.listAssets('project-1');

      expect(assets).toHaveLength(2);
    });
  });

  describe('getAsset', () => {
    it('returns an asset by id', async () => {
      const created = await service.uploadAsset({
        userId: USER,
        projectId: 'project-1',
        filename: 'clip.mp4',
        type: 'video',
        size: 50000000,
      });

      const asset = await service.getAsset(created.id, USER);

      expect(asset.filename).toBe('clip.mp4');
    });

    it('throws ASSET_NOT_FOUND for missing asset', async () => {
      await expect(service.getAsset('asset-missing', USER)).rejects.toThrow('Asset not found');
    });

    it('throws ASSET_NOT_FOUND for another user’s asset', async () => {
      const created = await service.uploadAsset({
        userId: USER,
        projectId: 'project-1',
        filename: 'clip.mp4',
        type: 'video',
        size: 10,
      });

      await expect(service.getAsset(created.id, 'user-2')).rejects.toThrow('Asset not found');
    });
  });

  describe('deleteAsset', () => {
    it('removes asset from storage', async () => {
      const created = await service.uploadAsset({
        userId: USER,
        projectId: 'project-1',
        filename: 'clip.mp4',
        type: 'video',
        size: 50000000,
      });

      await service.deleteAsset(created.id, USER);

      await expect(service.getAsset(created.id, USER)).rejects.toThrow('Asset not found');
    });

    it('throws ASSET_NOT_FOUND for non-existent asset', async () => {
      await expect(service.deleteAsset('asset-missing', USER)).rejects.toThrow(
        'Asset not found',
      );
    });

    it('also deletes the uploaded object bytes', async () => {
      const { assetId, key } = await service.generateUploadUrl(USER, {
        projectId: 'project-1',
        filename: 'clip.mp4',
        contentType: 'video/mp4',
        size: 4,
      });
      storage.put(key, Buffer.from('abcd'), 'video/mp4');
      await service.completeUpload(assetId, USER);
      expect(storage.has(key)).toBe(true);

      await service.deleteAsset(assetId, USER);

      expect(storage.has(key)).toBe(false);
    });
  });

  describe('listAllAssets (P0-2: backs GET /assets)', () => {
    beforeEach(async () => {
      await service.uploadAsset({
        userId: USER,
        projectId: 'project-1',
        filename: 'Intro Clip.mp4',
        type: 'video',
        size: 100,
      });
      await service.uploadAsset({
        userId: USER,
        projectId: 'project-2',
        filename: 'logo.png',
        type: 'image',
        size: 200,
      });
      await service.uploadAsset({
        userId: USER,
        projectId: 'project-2',
        filename: 'outro clip.mov',
        type: 'video',
        size: 300,
      });
    });

    it('lists across projects, newest first', async () => {
      const all = await service.listAllAssets(USER);
      expect(all.map((a) => a.filename)).toEqual(['outro clip.mov', 'logo.png', 'Intro Clip.mp4']);
    });

    it('filters by category (asset type)', async () => {
      const videos = await service.listAllAssets(USER, { category: 'video' });
      expect(videos.map((a) => a.filename)).toEqual(['outro clip.mov', 'Intro Clip.mp4']);
    });

    it('filters by search over the filename, case-insensitively', async () => {
      const hits = await service.listAllAssets(USER, { search: 'CLIP' });
      expect(hits.map((a) => a.filename)).toEqual(['outro clip.mov', 'Intro Clip.mp4']);
    });

    it('filters by projectId', async () => {
      const hits = await service.listAllAssets(USER, { projectId: 'project-2' });
      expect(hits.map((a) => a.filename)).toEqual(['outro clip.mov', 'logo.png']);
    });

    it('does not list another user’s assets', async () => {
      await service.uploadAsset({
        userId: 'user-2',
        projectId: 'project-9',
        filename: 'theirs.mp4',
        type: 'video',
        size: 1,
      });

      const all = await service.listAllAssets(USER);
      expect(all.map((a) => a.filename)).not.toContain('theirs.mp4');
    });
  });

  describe('generateUploadUrl (P0-3: upload step 1)', () => {
    it('creates a PENDING row first and returns a signed URL on the deterministic key', async () => {
      const result = await service.generateUploadUrl(USER, {
        projectId: 'project-1',
        filename: 'clip.mp4',
        contentType: 'video/mp4',
        size: 1234,
      });

      expect(result.uploadUrl).toContain(FAKE_STORAGE_HOST);
      expect(result.key).toBe(
        `quantcooks/${USER}/project-1/${result.assetId}/clip.mp4`,
      );
      // The id is the persisted row's id, not an invented counter id.
      expect(result.assetId).toBe(prisma.rows[0]!.id);
      expect(result.assetId).not.toMatch(/^asset-\d+$/);
      expect(result.requiredHeaders['Content-Type']).toBe('video/mp4');
      expect(result.requiredHeaders['Content-Length']).toBe('1234');

      const asset = await service.getAsset(result.assetId, USER);
      expect(asset.uploadStatus).toBe('PENDING');
      expect(asset.url).toBeNull();
      expect(asset.storageKey).toBe(result.key);
      expect(asset.type).toBe('video');
    });

    it('sanitizes path separators out of the filename before keying', async () => {
      const result = await service.generateUploadUrl(USER, {
        projectId: 'project-1',
        filename: '../../etc/evil.mp4',
        contentType: 'video/mp4',
        size: 10,
      });

      expect(result.key.endsWith('/evil.mp4')).toBe(true);
      expect(result.key).not.toContain('..');
    });

    it('rejects 503 STORAGE_NOT_CONFIGURED and creates no row when storage is null', async () => {
      const noStorage = new AssetService(prisma, null);

      await expect(
        noStorage.generateUploadUrl(USER, {
          projectId: 'project-1',
          filename: 'clip.mp4',
          contentType: 'video/mp4',
          size: 10,
        }),
      ).rejects.toMatchObject({ statusCode: 503, code: 'STORAGE_NOT_CONFIGURED' });
      expect(prisma.rows).toHaveLength(0);
    });

    it('rejects 413 ASSET_TOO_LARGE and creates no row above the cap', async () => {
      const capped = new AssetService(prisma, storage.port, { maxUploadBytes: 100 });

      await expect(
        capped.generateUploadUrl(USER, {
          projectId: 'project-1',
          filename: 'big.mp4',
          contentType: 'video/mp4',
          size: 101,
        }),
      ).rejects.toMatchObject({ statusCode: 413, code: 'ASSET_TOO_LARGE' });
      expect(prisma.rows).toHaveLength(0);
    });
  });

  describe('completeUpload (P0-3: upload step 3)', () => {
    async function initiate(size = 4) {
      return service.generateUploadUrl(USER, {
        projectId: 'project-1',
        filename: 'clip.mp4',
        contentType: 'video/mp4',
        size,
      });
    }

    it('marks the asset READY, persists the key (not a signed URL), and returns a signed URL', async () => {
      const { assetId, key } = await initiate();
      storage.put(key, Buffer.from('abcd'), 'video/mp4');

      const asset = await service.completeUpload(assetId, USER);

      expect(asset.uploadStatus).toBe('READY');
      expect(asset.url).toBe(`${FAKE_STORAGE_HOST}/${key}?signed=1`);
      expect(asset.storageKey).toBe(key);

      // The DB row holds the raw key — signed URLs are never persisted.
      const row = prisma.rows.find((r) => r.id === assetId)!;
      expect(row.url).toBe(key);

      // A later read still returns a freshly signed URL, never the raw key.
      const fetched = await service.getAsset(assetId, USER);
      expect(fetched.url).toBe(`${FAKE_STORAGE_HOST}/${key}?signed=1`);
    });

    it('is idempotent for an already-READY asset', async () => {
      const { assetId, key } = await initiate();
      storage.put(key, Buffer.from('abcd'), 'video/mp4');

      await service.completeUpload(assetId, USER);
      const again = await service.completeUpload(assetId, USER);

      expect(again.uploadStatus).toBe('READY');
    });

    it('rejects 409 UPLOAD_NOT_CONFIRMED when nothing was uploaded', async () => {
      const { assetId } = await initiate();

      await expect(service.completeUpload(assetId, USER)).rejects.toMatchObject({
        statusCode: 409,
        code: 'UPLOAD_NOT_CONFIRMED',
      });

      const asset = await service.getAsset(assetId, USER);
      expect(asset.uploadStatus).toBe('PENDING');
    });

    it('rejects 409 UPLOAD_SIZE_MISMATCH when the landed size differs', async () => {
      const { assetId, key } = await initiate(4);
      storage.put(key, Buffer.from('abc'), 'video/mp4'); // 3 bytes, declared 4

      await expect(service.completeUpload(assetId, USER)).rejects.toMatchObject({
        statusCode: 409,
        code: 'UPLOAD_SIZE_MISMATCH',
      });
    });

    it('rejects 503 when storage is not configured', async () => {
      const { assetId } = await initiate();
      const noStorage = new AssetService(prisma, null);

      await expect(noStorage.completeUpload(assetId, USER)).rejects.toMatchObject({
        statusCode: 503,
        code: 'STORAGE_NOT_CONFIGURED',
      });
    });

    it('throws ASSET_NOT_FOUND for another user’s asset', async () => {
      const { assetId, key } = await initiate();
      storage.put(key, Buffer.from('abcd'), 'video/mp4');

      await expect(service.completeUpload(assetId, 'user-2')).rejects.toThrow(
        'Asset not found',
      );
    });
  });

  describe('persistence across instances', () => {
    it('a second service instance over the same store sees the asset (restart)', async () => {
      const created = await service.uploadAsset({
        userId: USER,
        projectId: 'project-1',
        filename: 'clip.mp4',
        type: 'video',
        size: 42,
      });

      const restarted = new AssetService(prisma, storage.port);
      const fetched = await restarted.getAsset(created.id, USER);

      expect(fetched.filename).toBe('clip.mp4');
    });
  });

  describe('fabricated-URL guard', () => {
    it('no backend asset source can produce a storage.quant.example.com URL', () => {
      const here = fileURLToPath(new URL('.', import.meta.url));
      for (const rel of ['../services/asset.service.ts', '../routes/assets.ts']) {
        const src = readFileSync(resolve(here, rel), 'utf8');
        expect(src).not.toContain('storage.quant.example.com');
      }
    });
  });
});
