// ============================================================================
// Moderation - Perceptual Hash
// DCT-based pHash for image dedup and SimHash for text dedup
// ============================================================================

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: Pure JS DCT-based pHash from raw buffer bytes, not a production perceptual hash library
 * Production path: Use sharp + blockhash or dedicated pHash library (e.g. phash-image)
 *
 * PerceptualHasher - Perceptual hashing for content deduplication
 *
 * Provides:
 * - DCT-based perceptual hash (pHash) for images
 * - Async sharp-based perceptual hash for production use
 * - SimHash for text content
 * - Hamming distance comparison for both
 * - Near-duplicate detection with configurable thresholds
 */
export class PerceptualHasher {
  private static readonly HASH_SIZE = 64;
  private static readonly DEFAULT_THRESHOLD = 10;

  /**
   * Compute a 64-bit perceptual hash from an image buffer.
   * Simulates a DCT-based pHash algorithm by processing raw pixel data.
   * This is the synchronous fallback; prefer computeImageHashAsync for production.
   */
  computeImageHash(buffer: Buffer): string {
    // Simulate reducing image to 8x8 grayscale then computing DCT
    const size = 8;
    const values: number[] = [];

    // Sample bytes from the buffer at regular intervals to simulate 8x8 downsampling
    const step = Math.max(1, Math.floor(buffer.length / (size * size)));
    for (let i = 0; i < size * size; i++) {
      const byteIndex = Math.min(i * step, buffer.length - 1);
      values.push(buffer[byteIndex] ?? 0);
    }

    // Compute simplified DCT coefficients
    const dctValues = this.computeDCT(values, size);

    // Compute median of DCT values (excluding DC component)
    const dctSubset = dctValues.slice(1);
    const sorted = [...dctSubset].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;

    // Generate hash: 1 if above median, 0 if below
    let hash = '';
    for (const val of dctSubset) {
      hash += val > median ? '1' : '0';
    }

    // Pad or trim to 64 bits
    hash = hash.substring(0, PerceptualHasher.HASH_SIZE).padEnd(PerceptualHasher.HASH_SIZE, '0');

    // Convert binary string to hex
    return this.binaryToHex(hash);
  }

  /**
   * Compute a 64-bit perceptual hash from an image buffer using sharp.
   * Resizes image to 32x32 grayscale, computes DCT, derives hash from frequency domain.
   * Falls back to the synchronous DCT method if sharp is unavailable.
   */
  async computeImageHashAsync(buffer: Buffer): Promise<string> {
    try {
      const sharpModule = await import('sharp');
      const sharpFn = (sharpModule.default ?? sharpModule) as (input: Buffer) => {
        resize(
          w: number,
          h: number,
        ): {
          grayscale(): {
            raw(): {
              toBuffer(opts: { resolveWithObject: boolean }): Promise<{ data: Buffer }>;
            };
          };
        };
      };

      const { data } = await sharpFn(buffer)
        .resize(32, 32)
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Compute DCT on the first 64 pixels (8x8 top-left block)
      const pixels: number[] = [];
      for (let i = 0; i < Math.min(data.length, 64); i++) {
        pixels.push(data[i] ?? 0);
      }

      // Pad to 64 if needed
      while (pixels.length < 64) {
        pixels.push(0);
      }

      const dctValues = this.computeDCT(pixels, 8);

      // Compute median of DCT values (excluding DC component)
      const dctSubset = dctValues.slice(1);
      const sorted = [...dctSubset].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;

      // Generate hash: 1 if above median, 0 if below
      let hash = '';
      for (const val of dctSubset) {
        hash += val > median ? '1' : '0';
      }

      // Pad or trim to 64 bits
      hash = hash.substring(0, PerceptualHasher.HASH_SIZE).padEnd(PerceptualHasher.HASH_SIZE, '0');

      return this.binaryToHex(hash);
    } catch {
      // Fall back to synchronous DCT-based method
      return this.computeImageHash(buffer);
    }
  }

  /**
   * Compare two image hashes using Hamming distance.
   * Returns number of differing bits (lower = more similar).
   */
  compareImageHashes(hash1: string, hash2: string): number {
    const bin1 = this.hexToBinary(hash1);
    const bin2 = this.hexToBinary(hash2);
    return this.hammingDistance(bin1, bin2);
  }

  /**
   * Check if two image hashes represent near-duplicate content.
   */
  isNearDuplicate(hash1: string, hash2: string, threshold?: number): boolean {
    const distance = this.compareImageHashes(hash1, hash2);
    return distance <= (threshold ?? PerceptualHasher.DEFAULT_THRESHOLD);
  }

  /**
   * Compute SimHash for text content deduplication.
   * Uses a fingerprint-based approach with token weighting.
   */
  computeSimHash(text: string): string {
    const tokens = this.tokenize(text);
    const vector = new Array<number>(PerceptualHasher.HASH_SIZE).fill(0);

    for (const token of tokens) {
      const tokenHash = this.hashToken(token);
      for (let i = 0; i < PerceptualHasher.HASH_SIZE; i++) {
        if (tokenHash[i] === '1') {
          vector[i] = (vector[i] ?? 0) + 1;
        } else {
          vector[i] = (vector[i] ?? 0) - 1;
        }
      }
    }

    // Convert to binary: positive values become 1, others become 0
    let hash = '';
    for (let i = 0; i < PerceptualHasher.HASH_SIZE; i++) {
      hash += (vector[i] ?? 0) > 0 ? '1' : '0';
    }

    return this.binaryToHex(hash);
  }

  /**
   * Compare two text hashes using Hamming distance.
   * Returns number of differing bits.
   */
  compareTextHashes(hash1: string, hash2: string): number {
    const bin1 = this.hexToBinary(hash1);
    const bin2 = this.hexToBinary(hash2);
    return this.hammingDistance(bin1, bin2);
  }

  // --- Private Methods ---

  private computeDCT(values: number[], size: number): number[] {
    const result: number[] = [];
    for (let u = 0; u < size; u++) {
      for (let v = 0; v < size; v++) {
        let sum = 0;
        for (let x = 0; x < size; x++) {
          for (let y = 0; y < size; y++) {
            const idx = x * size + y;
            const pixel = values[idx] ?? 0;
            sum +=
              pixel *
              Math.cos(((2 * x + 1) * u * Math.PI) / (2 * size)) *
              Math.cos(((2 * y + 1) * v * Math.PI) / (2 * size));
          }
        }
        const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
        const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
        result.push((cu * cv * sum) / (size / 2));
      }
    }
    return result;
  }

  private hammingDistance(bin1: string, bin2: string): number {
    let distance = 0;
    const len = Math.max(bin1.length, bin2.length);
    for (let i = 0; i < len; i++) {
      if ((bin1[i] ?? '0') !== (bin2[i] ?? '0')) {
        distance++;
      }
    }
    return distance;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 0);
  }

  private hashToken(token: string): string {
    // Simple hash function producing a 64-bit binary string
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;

    for (let i = 0; i < token.length; i++) {
      const c = token.charCodeAt(i);
      h1 ^= c;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= c;
      h2 = Math.imul(h2, 0x811c9dc5);
    }

    const part1 = (h1 >>> 0).toString(2).padStart(32, '0');
    const part2 = (h2 >>> 0).toString(2).padStart(32, '0');
    return part1 + part2;
  }

  private binaryToHex(binary: string): string {
    let hex = '';
    for (let i = 0; i < binary.length; i += 4) {
      const nibble = binary.substring(i, i + 4);
      hex += parseInt(nibble, 2).toString(16);
    }
    return hex;
  }

  private hexToBinary(hex: string): string {
    let binary = '';
    for (let i = 0; i < hex.length; i++) {
      const nibble = parseInt(hex[i] ?? '0', 16);
      binary += nibble.toString(2).padStart(4, '0');
    }
    return binary.padEnd(PerceptualHasher.HASH_SIZE, '0');
  }
}
