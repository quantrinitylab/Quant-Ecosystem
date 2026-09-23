import { describe, it, expect } from 'vitest';
import { DesktopChunkHydrator } from '../src/vfs/hydrator.js';
import { LruChunkCacheTs } from '../src/vfs/cache.js';
import { VfsManifestChunk } from '../src/vfs/manifest.js';

describe('Task W35-10: Desktop On-Demand Background Chunk Hydration Daemon', () => {
  it('calculates required 64KB chunks overlapping arbitrary read ranges', () => {
    const hydrator = new DesktopChunkHydrator();

    const chunks: VfsManifestChunk[] = [
      { hash: 'chunk_0', offset: 0, length: 65536 },
      { hash: 'chunk_1', offset: 65536, length: 65536 },
      { hash: 'chunk_2', offset: 131072, length: 65536 },
      { hash: 'chunk_3', offset: 196608, length: 65536 },
    ];

    // Read range: offset 50000, length 30000 (spans chunk_0 and chunk_1)
    const reqs = hydrator.calculateRequiredChunks(chunks, 50000, 30000);
    expect(reqs.length).toBe(2);
    expect(reqs[0].chunkHash).toBe('chunk_0');
    expect(reqs[1].chunkHash).toBe('chunk_1');

    // Read range completely inside chunk_2
    const singleReq = hydrator.calculateRequiredChunks(chunks, 140000, 1000);
    expect(singleReq.length).toBe(1);
    expect(singleReq[0].chunkHash).toBe('chunk_2');
  });

  it('hydrates byte range by fetching missing chunks and caching in LRU cache', async () => {
    const cache = new LruChunkCacheTs(10 * 1024 * 1024);
    const hydrator = new DesktopChunkHydrator(cache);

    // Mock 2 chunks of 64KB
    const c0Data = new Uint8Array(65536);
    const c1Data = new Uint8Array(65536);
    for (let i = 0; i < 65536; i++) {
      c0Data[i] = 0x11;
      c1Data[i] = 0x22;
    }

    const chunks: VfsManifestChunk[] = [
      { hash: 'h0', offset: 0, length: 65536 },
      { hash: 'h1', offset: 65536, length: 65536 },
    ];

    let fetchCount = 0;
    const fetcher = async (hash: string) => {
      fetchCount++;
      return hash === 'h0' ? c0Data : c1Data;
    };

    // Hydrate slice spanning end of chunk 0 and start of chunk 1
    // Offset: 65530 (last 6 bytes of c0), Length: 16 (6 bytes of c0 + 10 bytes of c1)
    const slice = await hydrator.hydrateRange(chunks, 65530, 16, fetcher);

    expect(slice.length).toBe(16);
    // First 6 bytes should be 0x11
    for (let i = 0; i < 6; i++) expect(slice[i]).toBe(0x11);
    // Next 10 bytes should be 0x22
    for (let i = 6; i < 16; i++) expect(slice[i]).toBe(0x22);

    expect(fetchCount).toBe(2);
    expect(cache.has('h0')).toBe(true);
    expect(cache.has('h1')).toBe(true);

    // Second read on same range should hit cache (0 additional network fetches)
    const cachedSlice = await hydrator.hydrateRange(chunks, 65530, 16, fetcher);
    expect(fetchCount).toBe(2); // Still 2!
    expect(cachedSlice).toEqual(slice);
  });

  it('enforces LRU cache byte capacity eviction', () => {
    // 150KB capacity cache
    const cache = new LruChunkCacheTs(150 * 1024);

    const chunkA = new Uint8Array(64 * 1024); // 64KB
    const chunkB = new Uint8Array(64 * 1024); // 64KB
    const chunkC = new Uint8Array(64 * 1024); // 64KB

    cache.put('A', chunkA);
    cache.put('B', chunkB);
    expect(cache.size()).toBe(2);

    // Putting chunk C brings total to 192KB > 150KB -> chunk A must be evicted
    cache.put('C', chunkC);
    expect(cache.size()).toBe(2);
    expect(cache.has('A')).toBe(false);
    expect(cache.has('B')).toBe(true);
    expect(cache.has('C')).toBe(true);
  });
});
