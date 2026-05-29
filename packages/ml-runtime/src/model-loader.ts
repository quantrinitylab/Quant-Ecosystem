// ============================================================================
// Model Loader - Download, cache, and version ONNX models
// ============================================================================

import { z } from 'zod';

export interface StorageBackend {
  read(path: string): Promise<ArrayBuffer | null>;
  write(path: string, data: ArrayBuffer): Promise<void>;
  exists(path: string): Promise<boolean>;
  delete(path: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

export interface ModelDownloader {
  download(url: string): Promise<ArrayBuffer>;
}

export const ModelLoaderConfigSchema = z.object({
  cacheDir: z.string().default('/models/cache'),
  maxCacheSize: z
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024 * 1024), // 10GB
  enableChecksum: z.boolean().default(true),
  checksumAlgorithm: z.enum(['sha256', 'md5']).default('sha256'),
  maxVersions: z.number().int().positive().default(5),
});

export type ModelLoaderConfig = z.infer<typeof ModelLoaderConfigSchema>;

export interface ModelManifest {
  name: string;
  version: string;
  checksum: string;
  size: number;
  downloadedAt: number;
  lastAccessedAt: number;
  path: string;
}

export interface CacheStats {
  totalSize: number;
  modelCount: number;
  oldestModel: string | null;
  newestModel: string | null;
}

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: Defines ONNX loading interfaces but JS fallback has no real ONNX runtime bindings
 * Production path: Bind to onnxruntime-node native addon
 */
export class ModelLoader {
  private readonly config: ModelLoaderConfig;
  private readonly storage: StorageBackend;
  private readonly downloader: ModelDownloader;
  private readonly manifests: Map<string, ModelManifest> = new Map();
  private sequenceCounter: number = 0;

  constructor(
    storage: StorageBackend,
    downloader: ModelDownloader,
    config?: Partial<ModelLoaderConfig>,
  ) {
    this.config = ModelLoaderConfigSchema.parse(config ?? {});
    this.storage = storage;
    this.downloader = downloader;
  }

  async download(modelUrl: string, version: string, expectedChecksum?: string): Promise<string> {
    const modelName = this.extractModelName(modelUrl);
    const cacheKey = this.getCacheKey(modelName, version);
    const cachePath = `${this.config.cacheDir}/${cacheKey}`;

    // Check if already cached
    if (await this.storage.exists(cachePath)) {
      const manifest = this.manifests.get(cacheKey);
      if (manifest) {
        manifest.lastAccessedAt = Date.now();
        return cachePath;
      }
    }

    // Download model
    const data = await this.downloader.download(modelUrl);

    // Validate checksum if provided
    if (this.config.enableChecksum && expectedChecksum) {
      const actualChecksum = await this.computeChecksum(data);
      if (actualChecksum !== expectedChecksum) {
        throw new Error(
          `Checksum mismatch for ${modelName}@${version}: expected ${expectedChecksum}, got ${actualChecksum}`,
        );
      }
    }

    // Evict old models if needed
    await this.evictIfNeeded(data.byteLength);

    // Store model
    await this.storage.write(cachePath, data);

    // Update manifest
    const checksum = await this.computeChecksum(data);
    this.sequenceCounter++;
    const manifest: ModelManifest = {
      name: modelName,
      version,
      checksum,
      size: data.byteLength,
      downloadedAt: Date.now() + this.sequenceCounter * 0.001,
      lastAccessedAt: Date.now(),
      path: cachePath,
    };
    this.manifests.set(cacheKey, manifest);

    // Evict old versions
    await this.evictOldVersions(modelName);

    return cachePath;
  }

  async getModelPath(name: string, version: string): Promise<string | null> {
    const cacheKey = this.getCacheKey(name, version);
    const cachePath = `${this.config.cacheDir}/${cacheKey}`;

    if (await this.storage.exists(cachePath)) {
      const manifest = this.manifests.get(cacheKey);
      if (manifest) {
        manifest.lastAccessedAt = Date.now();
      }
      return cachePath;
    }
    return null;
  }

  async getModelBuffer(name: string, version: string): Promise<ArrayBuffer | null> {
    const path = await this.getModelPath(name, version);
    if (!path) return null;
    return this.storage.read(path);
  }

  async validateChecksum(
    name: string,
    version: string,
    expectedChecksum: string,
  ): Promise<boolean> {
    const buffer = await this.getModelBuffer(name, version);
    if (!buffer) return false;

    const actualChecksum = await this.computeChecksum(buffer);
    return actualChecksum === expectedChecksum;
  }

  async evictModel(name: string, version: string): Promise<void> {
    const cacheKey = this.getCacheKey(name, version);
    const cachePath = `${this.config.cacheDir}/${cacheKey}`;

    if (await this.storage.exists(cachePath)) {
      await this.storage.delete(cachePath);
      this.manifests.delete(cacheKey);
    }
  }

  getCacheStats(): CacheStats {
    let totalSize = 0;
    let oldest: ModelManifest | null = null;
    let newest: ModelManifest | null = null;

    for (const manifest of this.manifests.values()) {
      totalSize += manifest.size;
      if (!oldest || manifest.downloadedAt < oldest.downloadedAt) {
        oldest = manifest;
      }
      if (!newest || manifest.downloadedAt > newest.downloadedAt) {
        newest = manifest;
      }
    }

    return {
      totalSize,
      modelCount: this.manifests.size,
      oldestModel: oldest ? `${oldest.name}@${oldest.version}` : null,
      newestModel: newest ? `${newest.name}@${newest.version}` : null,
    };
  }

  getManifest(name: string, version: string): ModelManifest | undefined {
    return this.manifests.get(this.getCacheKey(name, version));
  }

  listModels(): ModelManifest[] {
    return Array.from(this.manifests.values());
  }

  private async evictIfNeeded(newSize: number): Promise<void> {
    const stats = this.getCacheStats();
    if (stats.totalSize + newSize <= this.config.maxCacheSize) {
      return;
    }

    // Evict least recently accessed models until we have space
    const sorted = Array.from(this.manifests.entries()).sort(
      ([, a], [, b]) => a.lastAccessedAt - b.lastAccessedAt,
    );

    let freed = 0;
    for (const [key, manifest] of sorted) {
      if (stats.totalSize + newSize - freed <= this.config.maxCacheSize) {
        break;
      }
      await this.storage.delete(manifest.path);
      this.manifests.delete(key);
      freed += manifest.size;
    }
  }

  private async evictOldVersions(modelName: string): Promise<void> {
    const versions = Array.from(this.manifests.entries())
      .filter(([, m]) => m.name === modelName)
      .sort(([, a], [, b]) => b.downloadedAt - a.downloadedAt);

    if (versions.length <= this.config.maxVersions) return;

    const toEvict = versions.slice(this.config.maxVersions);
    for (const [key, manifest] of toEvict) {
      await this.storage.delete(manifest.path);
      this.manifests.delete(key);
    }
  }

  private getCacheKey(name: string, version: string): string {
    return `${name}_v${version}`;
  }

  private extractModelName(url: string): string {
    const parts = url.split('/');
    const filename = parts[parts.length - 1] ?? url;
    return filename.replace(/\.onnx$/, '');
  }

  private async computeChecksum(data: ArrayBuffer): Promise<string> {
    const algorithm = this.config.checksumAlgorithm === 'md5' ? 'SHA-256' : 'SHA-256';
    // crypto.subtle only supports SHA-family; use SHA-256 for both config options
    const hashBuffer = await crypto.subtle.digest(algorithm, data);
    const hashArray = new Uint8Array(hashBuffer);
    return Array.from(hashArray)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
