/**
 * FastCDC Content-Defined Chunking (CDC) Engine
 *
 * Implements FastCDC with 64KB target chunking, Gear table byte hashing,
 * and normalized chunking to suppress boundary variation.
 *
 * - Min Chunk Size: 16 KB (16,384 B)
 * - Target Chunk Size: 64 KB (65,536 B)
 * - Max Chunk Size: 128 KB (131,072 B)
 */

import { GEAR_TABLE } from './gear-table.js';

export interface FastCdcConfig {
  minChunkSize?: number;
  targetChunkSize?: number;
  maxChunkSize?: number;
  maskStrict?: bigint;
  maskNormal?: bigint;
}

export interface Chunk {
  offset: number;
  length: number;
  data: Uint8Array;
}

const BIGINT_0 = BigInt(0);
const BIGINT_1 = BigInt(1);
const BIGINT_64_MASK = BigInt('0xffffffffffffffff');

export const DEFAULT_FASTCDC_CONFIG: Required<FastCdcConfig> = {
  minChunkSize: 16 * 1024, // 16 KB
  targetChunkSize: 64 * 1024, // 64 KB
  maxChunkSize: 128 * 1024, // 128 KB
  maskStrict: BigInt(0x7fff), // 15 bits
  maskNormal: BigInt(0x3fff), // 14 bits
};

/**
 * FastCDC Chunker for contiguous byte arrays.
 */
export function fastCdcChunk(buffer: Uint8Array, userConfig: FastCdcConfig = {}): Chunk[] {
  const config = { ...DEFAULT_FASTCDC_CONFIG, ...userConfig };
  const totalLength = buffer.length;

  if (totalLength === 0) {
    return [];
  }

  // If buffer is smaller than minChunkSize, entire buffer is 1 chunk
  if (totalLength <= config.minChunkSize) {
    return [
      {
        offset: 0,
        length: totalLength,
        data: buffer.slice(0, totalLength),
      },
    ];
  }

  const chunks: Chunk[] = [];
  let chunkStart = 0;

  while (chunkStart < totalLength) {
    const remaining = totalLength - chunkStart;

    // Last chunk remainder smaller than minChunkSize
    if (remaining <= config.minChunkSize) {
      chunks.push({
        offset: chunkStart,
        length: remaining,
        data: buffer.slice(chunkStart, totalLength),
      });
      break;
    }

    let fp = BIGINT_0;
    let offset = config.minChunkSize;
    const maxOffset = Math.min(config.maxChunkSize, remaining);

    // 1. Normalized Region: minChunkSize <= offset < targetChunkSize
    const targetOffset = Math.min(config.targetChunkSize, remaining);
    let cutFound = false;

    while (offset < targetOffset) {
      const byte = buffer[chunkStart + offset] ?? 0;
      const gearVal = GEAR_TABLE[byte] ?? BIGINT_0;
      fp = ((fp << BIGINT_1) + gearVal) & BIGINT_64_MASK;

      if ((fp & config.maskStrict) === BIGINT_0) {
        cutFound = true;
        offset++;
        break;
      }
      offset++;
    }

    // 2. Normal Region: targetChunkSize <= offset < maxOffset
    if (!cutFound) {
      while (offset < maxOffset) {
        const byte = buffer[chunkStart + offset] ?? 0;
        const gearVal = GEAR_TABLE[byte] ?? BIGINT_0;
        fp = ((fp << BIGINT_1) + gearVal) & BIGINT_64_MASK;

        if ((fp & config.maskNormal) === BIGINT_0) {
          cutFound = true;
          offset++;
          break;
        }
        offset++;
      }
    }

    // 3. Max chunk reached or boundary found
    const chunkLength = offset;
    chunks.push({
      offset: chunkStart,
      length: chunkLength,
      data: buffer.slice(chunkStart, chunkStart + chunkLength),
    });

    chunkStart += chunkLength;
  }

  return chunks;
}
