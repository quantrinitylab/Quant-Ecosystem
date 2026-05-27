import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModelLoader } from '../model-loader';
import type { StorageBackend, ModelDownloader } from '../model-loader';

function createMockStorage(): StorageBackend {
  const store = new Map<string, ArrayBuffer>();
  return {
    read: vi.fn(async (path: string) => store.get(path) ?? null),
    write: vi.fn(async (path: string, data: ArrayBuffer) => {
      store.set(path, data);
    }),
    exists: vi.fn(async (path: string) => store.has(path)),
    delete: vi.fn(async (path: string) => {
      store.delete(path);
    }),
    list: vi.fn(async (prefix: string) =>
      Array.from(store.keys()).filter((k) => k.startsWith(prefix)),
    ),
  };
}

function createMockDownloader(data?: ArrayBuffer): ModelDownloader {
  return {
    download: vi.fn(async () => data ?? new ArrayBuffer(1024)),
  };
}

describe('ModelLoader', () => {
  let storage: StorageBackend;
  let downloader: ModelDownloader;
  let loader: ModelLoader;

  beforeEach(() => {
    storage = createMockStorage();
    downloader = createMockDownloader();
    loader = new ModelLoader(storage, downloader, {
      cacheDir: '/cache',
      maxCacheSize: 10000,
      maxVersions: 3,
    });
  });

  describe('download', () => {
    it('downloads and caches a model', async () => {
      const path = await loader.download('https://cdn.example.com/recommender.onnx', '1.0');
      expect(downloader.download).toHaveBeenCalledWith('https://cdn.example.com/recommender.onnx');
      expect(storage.write).toHaveBeenCalledWith(
        '/cache/recommender_v1.0',
        expect.any(ArrayBuffer),
      );
      expect(path).toBe('/cache/recommender_v1.0');
    });

    it('returns cached path without re-downloading', async () => {
      await loader.download('https://cdn.example.com/model.onnx', '1.0');
      const path = await loader.download('https://cdn.example.com/model.onnx', '1.0');
      expect(downloader.download).toHaveBeenCalledTimes(1);
      expect(path).toBe('/cache/model_v1.0');
    });

    it('validates checksum when provided', async () => {
      const data = new ArrayBuffer(100);
      const customDownloader = createMockDownloader(data);
      const customLoader = new ModelLoader(storage, customDownloader, {
        cacheDir: '/cache',
        enableChecksum: true,
      });

      // Download with wrong checksum should throw
      await expect(
        customLoader.download('https://cdn.example.com/model.onnx', '1.0', 'invalid_checksum'),
      ).rejects.toThrow('Checksum mismatch');
    });

    it('skips checksum validation when disabled', async () => {
      const customLoader = new ModelLoader(storage, downloader, {
        cacheDir: '/cache',
        enableChecksum: false,
      });

      // Should not throw even with invalid checksum
      const path = await customLoader.download(
        'https://cdn.example.com/model.onnx',
        '1.0',
        'any_checksum',
      );
      expect(path).toBe('/cache/model_v1.0');
    });
  });

  describe('getModelPath', () => {
    it('returns path for cached model', async () => {
      await loader.download('https://cdn.example.com/model.onnx', '2.0');
      const path = await loader.getModelPath('model', '2.0');
      expect(path).toBe('/cache/model_v2.0');
    });

    it('returns null for uncached model', async () => {
      const path = await loader.getModelPath('nonexistent', '1.0');
      expect(path).toBeNull();
    });
  });

  describe('cache eviction', () => {
    it('evicts old versions beyond maxVersions', async () => {
      const smallLoader = new ModelLoader(storage, downloader, {
        cacheDir: '/cache',
        maxVersions: 2,
        maxCacheSize: 100000,
      });

      await smallLoader.download('https://cdn.example.com/model.onnx', '1.0');
      await smallLoader.download('https://cdn.example.com/model.onnx', '2.0');
      await smallLoader.download('https://cdn.example.com/model.onnx', '3.0');

      // Oldest version should be evicted
      expect(storage.delete).toHaveBeenCalledWith('/cache/model_v1.0');
    });

    it('evicts LRU models when cache is full', async () => {
      const tinyLoader = new ModelLoader(storage, downloader, {
        cacheDir: '/cache',
        maxCacheSize: 2000,
        maxVersions: 10,
      });

      await tinyLoader.download('https://cdn.example.com/model1.onnx', '1.0');
      await tinyLoader.download('https://cdn.example.com/model2.onnx', '1.0');
      await tinyLoader.download('https://cdn.example.com/model3.onnx', '1.0');

      // First model should be evicted due to cache size
      expect(storage.delete).toHaveBeenCalledWith('/cache/model1_v1.0');
    });
  });

  describe('getCacheStats', () => {
    it('returns accurate cache statistics', async () => {
      await loader.download('https://cdn.example.com/model1.onnx', '1.0');
      await loader.download('https://cdn.example.com/model2.onnx', '1.0');

      const stats = loader.getCacheStats();
      expect(stats.modelCount).toBe(2);
      expect(stats.totalSize).toBe(2048); // 2 x 1024 (default mock size)
      expect(stats.oldestModel).toContain('model1');
      expect(stats.newestModel).toContain('model2');
    });

    it('returns empty stats when no models cached', () => {
      const stats = loader.getCacheStats();
      expect(stats.modelCount).toBe(0);
      expect(stats.totalSize).toBe(0);
      expect(stats.oldestModel).toBeNull();
      expect(stats.newestModel).toBeNull();
    });
  });

  describe('evictModel', () => {
    it('removes a specific model from cache', async () => {
      await loader.download('https://cdn.example.com/model.onnx', '1.0');
      await loader.evictModel('model', '1.0');
      expect(storage.delete).toHaveBeenCalledWith('/cache/model_v1.0');
      expect(loader.getCacheStats().modelCount).toBe(0);
    });

    it('does nothing for uncached model', async () => {
      await loader.evictModel('nonexistent', '1.0');
      expect(storage.delete).not.toHaveBeenCalled();
    });
  });

  describe('listModels', () => {
    it('lists all cached model manifests', async () => {
      await loader.download('https://cdn.example.com/model1.onnx', '1.0');
      await loader.download('https://cdn.example.com/model2.onnx', '2.0');

      const models = loader.listModels();
      expect(models).toHaveLength(2);
      expect(models[0]!.name).toBe('model1');
      expect(models[1]!.name).toBe('model2');
    });
  });
});
