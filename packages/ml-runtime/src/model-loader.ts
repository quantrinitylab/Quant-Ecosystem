// ============================================================================
// Model Loader - Download, cache, and version ONNX models
// ============================================================================

import { z } from 'zod';
import * as ort from 'onnxruntime-node';

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
    .default(10 * 1024 * 1024 * 1024),
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

export class ModelLoader {
  private readonly config: ModelLoaderConfig;
  private readonly storage: StorageBackend;
  private readonly downloader: ModelDownloader;
  private readonly manifests: Map<string, ModelManifest> = new Map();
  private readonly sessions: Map<string, ort.InferenceSession> = new Map();
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

    if (await this.storage.exists(cachePath)) {
      const manifest = this.manifests.get(cacheKey);
      if (manifest) {
        manifest.lastAccessedAt = Date.now();
        return cachePath;
      }
    }

    const data = await this.downloader.download(modelUrl);

    if (this.config.enableChecksum && expectedChecksum) {
      const actualChecksum = await this.computeChecksum(data);
      if (actualChecksum !== expectedChecksum) {
        throw new Error(
          `Checksum mismatch for ${modelName}@${version}: expected ${expectedChecksum}, got ${actualChecksum}`,
        );
      }
    }

    await this.evictIfNeeded(data.byteLength);

    await this.storage.write(cachePath, data);

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

    await this.evictOldVersions(modelName);

    return cachePath;
  }

  async loadSession(
    name: string,
    version: string,
    options?: ort.InferenceSession.SessionOptions,
  ): Promise<ort.InferenceSession> {
    const cacheKey = this.getCacheKey(name, version);

    const existing = this.sessions.get(cacheKey);
    if (existing) return existing;

    const buffer = await this.getModelBuffer(name, version);
    if (!buffer) {
      throw new Error(`Model ${name}@${version} not found in cache`);
    }

    const uint8 = new Uint8Array(buffer);
    const session = await ort.InferenceSession.create(uint8, options);
    this.sessions.set(cacheKey, session);
    return session;
  }

  async runInference(
    name: string,
    version: string,
    feeds: ort.InferenceSession.OnnxValueMapType,
    options?: ort.InferenceSession.RunOptions,
  ): Promise<ort.InferenceSession.OnnxValueMapType> {
    const session = await this.loadSession(name, version);
    return session.run(feeds, options);
  }

  async unloadSession(name: string, version: string): Promise<void> {
    const cacheKey = this.getCacheKey(name, version);
    const session = this.sessions.get(cacheKey);
    if (session) {
      await session.release();
      this.sessions.delete(cacheKey);
    }
  }

  async releaseAllSessions(): Promise<void> {
    for (const [key, session] of this.sessions.entries()) {
      await session.release();
      this.sessions.delete(key);
    }
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

    await this.unloadSession(name, version);

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

  getLoadedSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  private async evictIfNeeded(newSize: number): Promise<void> {
    const stats = this.getCacheStats();
    if (stats.totalSize + newSize <= this.config.maxCacheSize) {
      return;
    }

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
    const hashBuffer = await crypto.subtle.digest(algorithm, data);
    const hashArray = new Uint8Array(hashBuffer);
    return Array.from(hashArray)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
