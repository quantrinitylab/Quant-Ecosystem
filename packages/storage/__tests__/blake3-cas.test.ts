import { describe, it, expect } from 'vitest';
import {
  computeBlake3Hash,
  CasChunkRegistry,
  InMemoryCasStorageAdapter,
} from '../src/blake3-cas.js';
import {
  buildFileManifest,
  reconstructFileFromChunks,
  computeDeduplicationStats,
} from '../src/chunk-manifest.js';

describe('Task W35-06: BLAKE3 Content-Addressable Storage (CAS) Registry', () => {
  it('computes 64-character lowercase hex BLAKE3/SHA-256 chunk hashes', () => {
    const data1 = new TextEncoder().encode('Hello, Quant Ecosystem!');
    const data2 = new TextEncoder().encode('Hello, Quant Ecosystem!');
    const data3 = new TextEncoder().encode('Different payload');

    const hash1 = computeBlake3Hash(data1);
    const hash2 = computeBlake3Hash(data2);
    const hash3 = computeBlake3Hash(data3);

    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
  });

  it('stores and retrieves chunks in CAS registry with 2-level directory sharding', async () => {
    const registry = new CasChunkRegistry();
    const data = new TextEncoder().encode('Sample CAS chunk data for storage verification');
    const hash = computeBlake3Hash(data);

    // Verify key sharding format: cas/chunks/ab/cd/abcd...
    const key = registry.getChunkKey(hash);
    expect(key).toBe(`cas/chunks/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`);

    // First put: newly stored
    const put1 = await registry.putChunk(data);
    expect(put1.isDuplicate).toBe(false);
    expect(put1.hash).toBe(hash);
    expect(registry.totalStoredChunks()).toBe(1);

    // Second put: duplicate detected
    const put2 = await registry.putChunk(data);
    expect(put2.isDuplicate).toBe(true);
    expect(registry.totalStoredChunks()).toBe(1);

    // Check retrieval
    const retrieved = await registry.getChunk(hash);
    expect(retrieved).not.toBeNull();
    expect(new TextDecoder().decode(retrieved!)).toBe(
      'Sample CAS chunk data for storage verification',
    );
  });

  it('identifies missing chunks for delta synchronization', async () => {
    const registry = new CasChunkRegistry();
    const c1 = new TextEncoder().encode('Chunk 1 data');
    const c2 = new TextEncoder().encode('Chunk 2 data');
    const c3 = new TextEncoder().encode('Chunk 3 data');

    const h1 = computeBlake3Hash(c1);
    const h2 = computeBlake3Hash(c2);
    const h3 = computeBlake3Hash(c3);

    await registry.putChunk(c1);
    // c2 and c3 are not uploaded yet

    const missing = await registry.checkMissingChunks([h1, h2, h3]);
    expect(missing).toEqual([h2, h3]);
  });

  it('builds file manifest, reconstructs file byte-for-byte, and measures deduplication', async () => {
    const registry = new CasChunkRegistry();

    // Create 300KB file data
    const size = 300 * 1024;
    const fileBytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) fileBytes[i] = (i * 37) & 0xff;

    // Build manifest
    const { manifest, chunkDataMap } = buildFileManifest(
      'file-001',
      'project_archive.tar',
      fileBytes,
    );
    expect(manifest.fileId).toBe('file-001');
    expect(manifest.totalSize).toBe(size);
    expect(manifest.chunks.length).toBeGreaterThanOrEqual(2);

    // Upload all chunks to CAS registry
    for (const data of chunkDataMap.values()) {
      await registry.putChunk(data);
    }

    // Reconstruct file
    const reconstructed = await reconstructFileFromChunks(manifest, async (hash) => {
      return registry.getChunk(hash);
    });

    expect(reconstructed.length).toBe(fileBytes.length);
    for (let i = 0; i < size; i++) {
      expect(reconstructed[i]).toBe(fileBytes[i]);
    }

    // Now test deduplication across two files sharing content:
    // File B shares 90% of File A
    const fileBBytes = new Uint8Array(size);
    fileBBytes.set(fileBytes.subarray(0, size - 20000), 0);
    // alter final 20KB
    for (let i = size - 20000; i < size; i++) fileBBytes[i] = 0xcc;

    const { manifest: manifestB } = buildFileManifest(
      'file-002',
      'project_archive_v2.tar',
      fileBBytes,
    );

    const dedup = computeDeduplicationStats([manifest, manifestB]);
    expect(dedup.totalBytes).toBe(size * 2);
    // Unique bytes must be less than total bytes due to shared chunks
    expect(dedup.uniqueBytes).toBeLessThan(dedup.totalBytes);
    expect(dedup.savingsBytes).toBeGreaterThan(0);
    expect(dedup.dedupRatio).toBeGreaterThan(1.2);
  });
});
