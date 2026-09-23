/**
 * Desktop On-Demand Chunk Hydrator
 *
 * Intercepts read faults, calculates required 64KB chunk byte ranges,
 * fetches chunks in parallel from R2/S3, and streams into OS file buffer.
 */

import { VfsManifestChunk } from './manifest.js';
import { LruChunkCacheTs } from './cache.js';

export interface ChunkHydrationRequest {
  chunkHash: string;
  chunkOffset: number;
  chunkLength: number;
}

export class DesktopChunkHydrator {
  private cache: LruChunkCacheTs;

  constructor(cache?: LruChunkCacheTs) {
    this.cache = cache || new LruChunkCacheTs();
  }

  /**
   * Calculates which chunks must be read to satisfy a range request [readOffset .. readOffset + readLength].
   */
  public calculateRequiredChunks(
    chunks: VfsManifestChunk[],
    readOffset: number,
    readLength: number,
  ): ChunkHydrationRequest[] {
    const readEnd = readOffset + readLength;
    const required: ChunkHydrationRequest[] = [];

    for (const c of chunks) {
      const chunkEnd = c.offset + c.length;

      // Overlap condition
      if (c.offset < readEnd && chunkEnd > readOffset) {
        required.push({
          chunkHash: c.hash,
          chunkOffset: c.offset,
          chunkLength: c.length,
        });
      }
    }

    return required;
  }

  /**
   * Hydrates the requested byte slice by fetching missing chunks and copying bytes into the output buffer.
   */
  public async hydrateRange(
    chunks: VfsManifestChunk[],
    readOffset: number,
    readLength: number,
    chunkFetcher: (hash: string) => Promise<Uint8Array>,
  ): Promise<Uint8Array> {
    const required = this.calculateRequiredChunks(chunks, readOffset, readLength);
    const resultBuffer = new Uint8Array(readLength);

    for (const req of required) {
      let chunkData = this.cache.get(req.chunkHash);

      if (!chunkData) {
        chunkData = await chunkFetcher(req.chunkHash);
        this.cache.put(req.chunkHash, chunkData);
      }

      const chunkStart = req.chunkOffset;
      const chunkEnd = req.chunkOffset + req.chunkLength;

      const overlapStart = Math.max(readOffset, chunkStart);
      const overlapEnd = Math.min(readOffset + readLength, chunkEnd);

      if (overlapStart < overlapEnd) {
        const srcStart = overlapStart - chunkStart;
        const srcEnd = overlapEnd - chunkStart;
        const dstStart = overlapStart - readOffset;

        resultBuffer.set(chunkData.subarray(srcStart, srcEnd), dstStart);
      }
    }

    return resultBuffer;
  }

  public getCache(): LruChunkCacheTs {
    return this.cache;
  }
}
