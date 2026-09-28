import { describe, it, expect, beforeEach } from 'vitest';
import { AssetService } from '../services/asset.service';

describe('AssetService', () => {
  let service: AssetService;

  beforeEach(() => {
    service = new AssetService();
  });

  describe('uploadAsset', () => {
    it('creates an asset and returns it', async () => {
      const asset = await service.uploadAsset({
        projectId: 'project-1',
        filename: 'clip.mp4',
        type: 'video',
        size: 50000000,
      });

      expect(asset.projectId).toBe('project-1');
      expect(asset.filename).toBe('clip.mp4');
      expect(asset.type).toBe('video');
      expect(asset.size).toBe(50000000);
    });
  });

  describe('listAssets', () => {
    it('returns assets for a project', async () => {
      await service.uploadAsset({
        projectId: 'project-1',
        filename: 'clip1.mp4',
        type: 'video',
        size: 50000000,
      });
      await service.uploadAsset({
        projectId: 'project-1',
        filename: 'clip2.mp4',
        type: 'video',
        size: 30000000,
      });
      await service.uploadAsset({
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
        projectId: 'project-1',
        filename: 'clip.mp4',
        type: 'video',
        size: 50000000,
      });

      const asset = await service.getAsset(created.id);

      expect(asset.filename).toBe('clip.mp4');
    });

    it('throws ASSET_NOT_FOUND for missing asset', async () => {
      await expect(service.getAsset('asset-missing')).rejects.toThrow('Asset not found');
    });
  });

  describe('deleteAsset', () => {
    it('removes asset from storage', async () => {
      const created = await service.uploadAsset({
        projectId: 'project-1',
        filename: 'clip.mp4',
        type: 'video',
        size: 50000000,
      });

      await service.deleteAsset(created.id);

      await expect(service.getAsset(created.id)).rejects.toThrow('Asset not found');
    });

    it('throws ASSET_NOT_FOUND for non-existent asset', async () => {
      await expect(service.deleteAsset('asset-missing')).rejects.toThrow('Asset not found');
    });
  });
});
