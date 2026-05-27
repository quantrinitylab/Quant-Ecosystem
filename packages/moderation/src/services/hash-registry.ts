// ============================================================================
// Moderation - Hash Registry
// Combines PerceptualHasher + BloomFilter for known-bad content detection
// ============================================================================

import { PerceptualHasher } from './perceptual-hash';
import { BloomFilter } from './bloom-filter';

/** Result of a hash check against the registry */
export interface HashCheckResult {
  found: boolean;
  distance: number;
}

/** Statistics from the hash registry */
export interface HashRegistryStats {
  totalRegistered: number;
  bloomFilterSize: number;
  bloomFilterHashCount: number;
  estimatedFalsePositiveRate: number;
  exactHashCount: number;
}

/**
 * HashRegistry - Combines PerceptualHasher + BloomFilter for efficient known-bad content lookup
 *
 * Uses a two-tier approach:
 * 1. Bloom filter for fast pre-check (probabilistic, no false negatives)
 * 2. Exact hash set for precise matching when bloom filter indicates a possible match
 */
export class HashRegistry {
  private readonly hasher: PerceptualHasher;
  private readonly bloomFilter: BloomFilter;
  private readonly exactHashes: Set<string>;

  constructor(hasher: PerceptualHasher, bloomFilter: BloomFilter) {
    this.hasher = hasher;
    this.bloomFilter = bloomFilter;
    this.exactHashes = new Set();
  }

  /** Register an image buffer's hash in the registry */
  registerHash(buffer: Buffer): string {
    const hash = this.hasher.computeImageHash(buffer);
    this.bloomFilter.add(hash);
    this.exactHashes.add(hash);
    return hash;
  }

  /** Register a pre-computed hash string directly */
  registerHashString(hash: string): void {
    this.bloomFilter.add(hash);
    this.exactHashes.add(hash);
  }

  /** Check an image buffer against the registry */
  checkHash(buffer: Buffer): HashCheckResult {
    const hash = this.hasher.computeImageHash(buffer);
    return this.checkHashString(hash);
  }

  /** Check a pre-computed hash string against the registry */
  checkHashString(hash: string): HashCheckResult {
    // Fast bloom filter pre-check
    if (!this.bloomFilter.has(hash)) {
      return { found: false, distance: -1 };
    }

    // Exact match check
    if (this.exactHashes.has(hash)) {
      return { found: true, distance: 0 };
    }

    // Near-duplicate check against all stored hashes
    let minDistance = Infinity;
    for (const storedHash of this.exactHashes) {
      const distance = this.hasher.compareImageHashes(hash, storedHash);
      if (distance < minDistance) {
        minDistance = distance;
      }
    }

    // If within threshold, report as found with distance
    const threshold = 10;
    if (minDistance <= threshold) {
      return { found: true, distance: minDistance };
    }

    // Bloom filter false positive
    return { found: false, distance: minDistance === Infinity ? -1 : minDistance };
  }

  /** Get registry statistics for monitoring */
  getStats(): HashRegistryStats {
    return {
      totalRegistered: this.bloomFilter.getItemCount(),
      bloomFilterSize: this.bloomFilter.getSize(),
      bloomFilterHashCount: this.bloomFilter.getHashCount(),
      estimatedFalsePositiveRate: this.bloomFilter.estimateFalsePositiveRate(),
      exactHashCount: this.exactHashes.size,
    };
  }
}
