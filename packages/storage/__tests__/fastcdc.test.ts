import { describe, it, expect } from 'vitest';
import { GEAR_TABLE } from '../src/gear-table.js';
import { fastCdcChunk, DEFAULT_FASTCDC_CONFIG } from '../src/fastcdc.js';
import { computeBlake3Hash } from '../src/blake3-cas.js';

describe('Task W35-05: FastCDC 64KB Gear Table Content-Defined Chunking Engine', () => {
  it('validates 256-entry 64-bit Gear lookup table', () => {
    expect(GEAR_TABLE).toBeInstanceOf(BigUint64Array);
    expect(GEAR_TABLE.length).toBe(256);

    // Verify non-zero and distinct elements
    const uniqueValues = new Set<bigint>();
    for (let i = 0; i < 256; i++) {
      expect(GEAR_TABLE[i]).not.toBe(0n);
      uniqueValues.add(GEAR_TABLE[i]);
    }
    expect(uniqueValues.size).toBe(256);
  });

  it('chunks empty buffer returning empty array', () => {
    const chunks = fastCdcChunk(new Uint8Array(0));
    expect(chunks).toEqual([]);
  });

  it('keeps buffer smaller than 16KB as a single chunk', () => {
    const smallBuffer = new Uint8Array(10 * 1024); // 10 KB
    for (let i = 0; i < smallBuffer.length; i++) smallBuffer[i] = i % 256;

    const chunks = fastCdcChunk(smallBuffer);
    expect(chunks.length).toBe(1);
    expect(chunks[0].offset).toBe(0);
    expect(chunks[0].length).toBe(10 * 1024);
  });

  it('enforces min 16KB and max 128KB chunk bounds on large buffers', () => {
    const size = 1024 * 1024; // 1 MB
    const largeBuffer = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      // Semi-random byte distribution
      largeBuffer[i] = (i * 31 + (i >> 5)) & 0xff;
    }

    const chunks = fastCdcChunk(largeBuffer);
    expect(chunks.length).toBeGreaterThan(5);

    let totalCovered = 0;
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      // Offset must match previous accumulated length
      expect(c.offset).toBe(totalCovered);

      // Check min size for all except possibly the final tail chunk
      if (i < chunks.length - 1) {
        expect(c.length).toBeGreaterThanOrEqual(DEFAULT_FASTCDC_CONFIG.minChunkSize);
      }
      // Must not exceed max chunk size
      expect(c.length).toBeLessThanOrEqual(DEFAULT_FASTCDC_CONFIG.maxChunkSize);

      totalCovered += c.length;
    }

    expect(totalCovered).toBe(size);
  });

  it('demonstrates boundary-shift resistance: inserting 1 byte alters only 1-2 chunks and preserves subsequent chunks', () => {
    // Generate 1.2MB buffer
    const size = 1200 * 1024;
    const original = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      original[i] = (i * 101 + (i ^ 0xaa)) & 0xff;
    }

    const originalChunks = fastCdcChunk(original);
    expect(originalChunks.length).toBeGreaterThanOrEqual(8);

    // Choose an insertion point in the second chunk
    const secondChunk = originalChunks[1];
    const insertionPoint = secondChunk.offset + 100;

    // Create modified buffer with 1 byte inserted
    const modified = new Uint8Array(size + 1);
    modified.set(original.subarray(0, insertionPoint), 0);
    modified[insertionPoint] = 0xee; // inserted byte
    modified.set(original.subarray(insertionPoint), insertionPoint + 1);

    const modifiedChunks = fastCdcChunk(modified);

    // Compute hashes for chunks in both
    const origHashes = originalChunks.map((c) => computeBlake3Hash(c.data));
    const modHashes = modifiedChunks.map((c) => computeBlake3Hash(c.data));

    // The first chunk (before insertion) must be identical
    expect(modHashes[0]).toBe(origHashes[0]);

    // FastCDC ensures that the vast majority of chunk hashes match despite 1-byte shift
    const sharedHashes = origHashes.filter((h) => modHashes.includes(h));
    // At most 2 chunks are affected (the modified chunk and the boundary resync chunk)
    expect(sharedHashes.length).toBeGreaterThanOrEqual(originalChunks.length - 2);
  });
});
