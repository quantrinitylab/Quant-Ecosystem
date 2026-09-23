/**
 * Desktop LRU Chunk Cache
 *
 * Manages local cache of hydrated 64KB chunks with strict byte limit.
 */

export class LruChunkCacheTs {
  private maxBytes: number;
  private currentBytes = 0;
  private cache = new Map<string, Uint8Array>();

  constructor(maxBytes = 500 * 1024 * 1024) {
    // Default 500MB
    this.maxBytes = maxBytes;
  }

  public get(hash: string): Uint8Array | undefined {
    const data = this.cache.get(hash);
    if (!data) return undefined;

    // Refresh LRU order (delete & re-insert)
    this.cache.delete(hash);
    this.cache.set(hash, data);
    return data;
  }

  public put(hash: string, data: Uint8Array): void {
    const chunkLen = data.length;

    if (this.cache.has(hash)) {
      const existing = this.cache.get(hash)!;
      this.currentBytes = this.currentBytes - existing.length + chunkLen;
      this.cache.delete(hash);
      this.cache.set(hash, data);
      return;
    }

    // Evict oldest entries until within limit
    while (this.currentBytes + chunkLen > this.maxBytes && this.cache.size > 0) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        const removed = this.cache.get(oldestKey)!;
        this.currentBytes -= removed.length;
        this.cache.delete(oldestKey);
      }
    }

    this.currentBytes += chunkLen;
    this.cache.set(hash, data);
  }

  public has(hash: string): boolean {
    return this.cache.has(hash);
  }

  public getCurrentBytes(): number {
    return this.currentBytes;
  }

  public size(): number {
    return this.cache.size;
  }

  public clear(): void {
    this.cache.clear();
    this.currentBytes = 0;
  }
}
