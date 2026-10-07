// ============================================================================
// Moderation - Perceptual Hash
// DCT-based pHash for image dedup and SimHash for text dedup
// ============================================================================

/**
 * PerceptualHasher - Perceptual hashing for content deduplication
 *
 * Provides:
 * - DCT-based perceptual hash (pHash) for images with configurable hash sizes
 * - Async sharp-based perceptual hash for production use
 * - SimHash for text content
 * - 64-bit Hamming distance comparison
 * - Near-duplicate detection with configurable similarity thresholds
 */
export class PerceptualHasher {
  private static readonly HASH_SIZE = 64;
  private static readonly DEFAULT_THRESHOLD = 10;
  private hashSize: number;

  constructor(options?: { hashSize?: number }) {
    this.hashSize = options?.hashSize ?? PerceptualHasher.HASH_SIZE;
  }

  computeImageHash(buffer: Buffer): string {
    const gridSize = this.getGridSize();
    const totalPixels = gridSize * gridSize;
    const values: number[] = [];

    const step = Math.max(1, Math.floor(buffer.length / totalPixels));
    for (let i = 0; i < totalPixels; i++) {
      const byteIndex = Math.min(i * step, buffer.length - 1);
      values.push(buffer[byteIndex] ?? 0);
    }

    const dctValues = this.computeDCT2D(values, gridSize);
    const lowFreqCount = gridSize <= 8 ? gridSize : 8;
    const dctSubset = this.extractLowFrequency(dctValues, gridSize, lowFreqCount);

    const hashBits = this.dctToHash(dctSubset);
    return this.binaryToHex(this.padOrTrim(hashBits, this.hashSize));
  }

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

      const gridSize = 32;
      const { data } = await sharpFn(buffer)
        .resize(gridSize, gridSize)
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const pixels: number[] = [];
      for (let i = 0; i < Math.min(data.length, gridSize * gridSize); i++) {
        pixels.push(data[i] ?? 0);
      }

      while (pixels.length < gridSize * gridSize) {
        pixels.push(0);
      }

      const dctValues = this.computeDCT2D(pixels, gridSize);
      const lowFreqCount = 8;
      const dctSubset = this.extractLowFrequency(dctValues, gridSize, lowFreqCount);

      const hashBits = this.dctToHash(dctSubset);
      return this.binaryToHex(this.padOrTrim(hashBits, this.hashSize));
    } catch {
      return this.computeImageHash(buffer);
    }
  }

  compareImageHashes(hash1: string, hash2: string): number {
    const bin1 = this.hexToBinary(hash1);
    const bin2 = this.hexToBinary(hash2);
    return this.hammingDistance64(bin1, bin2);
  }

  isNearDuplicate(hash1: string, hash2: string, threshold?: number): boolean {
    const distance = this.compareImageHashes(hash1, hash2);
    return distance <= (threshold ?? PerceptualHasher.DEFAULT_THRESHOLD);
  }

  computeSimHash(text: string): string {
    const tokens = this.tokenize(text);
    if (tokens.length === 0) {
      return this.binaryToHex('0'.repeat(this.hashSize));
    }

    const vector = new Array<number>(this.hashSize).fill(0);

    for (const token of tokens) {
      const tokenHash = this.hashToken(token);
      const weight = this.tokenWeight(token);
      for (let i = 0; i < this.hashSize; i++) {
        if (tokenHash[i] === '1') {
          vector[i] = (vector[i] ?? 0) + weight;
        } else {
          vector[i] = (vector[i] ?? 0) - weight;
        }
      }
    }

    let hash = '';
    for (let i = 0; i < this.hashSize; i++) {
      hash += (vector[i] ?? 0) > 0 ? '1' : '0';
    }

    return this.binaryToHex(hash);
  }

  compareTextHashes(hash1: string, hash2: string): number {
    const bin1 = this.hexToBinary(hash1);
    const bin2 = this.hexToBinary(hash2);
    return this.hammingDistance64(bin1, bin2);
  }

  // --- Private Methods ---

  private getGridSize(): number {
    if (this.hashSize <= 16) return 4;
    if (this.hashSize <= 64) return 8;
    if (this.hashSize <= 256) return 16;
    return 32;
  }

  private computeDCT2D(values: number[], size: number): number[] {
    const result: number[] = [];
    const cosTable = this.precomputeCosTable(size);

    for (let u = 0; u < size; u++) {
      for (let v = 0; v < size; v++) {
        let sum = 0;
        for (let x = 0; x < size; x++) {
          for (let y = 0; y < size; y++) {
            const idx = x * size + y;
            const pixel = values[idx] ?? 0;
            sum += pixel * cosTable[u]![x]! * cosTable[v]![y]!;
          }
        }
        const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
        const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
        result.push((2 / size) * cu * cv * sum);
      }
    }
    return result;
  }

  private precomputeCosTable(size: number): number[][] {
    const table: number[][] = [];
    for (let k = 0; k < size; k++) {
      table[k] = [];
      for (let n = 0; n < size; n++) {
        table[k]![n] = Math.cos(((2 * n + 1) * k * Math.PI) / (2 * size));
      }
    }
    return table;
  }

  private extractLowFrequency(
    dctValues: number[],
    gridSize: number,
    lowFreqSize: number,
  ): number[] {
    const result: number[] = [];
    for (let u = 0; u < lowFreqSize; u++) {
      for (let v = 0; v < lowFreqSize; v++) {
        result.push(dctValues[u * gridSize + v] ?? 0);
      }
    }
    return result;
  }

  private dctToHash(dctSubset: number[]): string {
    if (dctSubset.length <= 1) return '0';

    const acValues = dctSubset.slice(1);
    const sorted = [...acValues].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;

    let hash = '';
    for (const val of acValues) {
      hash += val > median ? '1' : '0';
    }

    return hash;
  }

  private hammingDistance64(bin1: string, bin2: string): number {
    let distance = 0;
    const len = Math.max(bin1.length, bin2.length);
    for (let i = 0; i < len; i++) {
      if ((bin1[i] ?? '0') !== (bin2[i] ?? '0')) {
        distance++;
      }
    }
    return distance;
  }

  private padOrTrim(binary: string, targetLength: number): string {
    if (binary.length >= targetLength) return binary.substring(0, targetLength);
    return binary.padEnd(targetLength, '0');
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 0);
  }

  private tokenWeight(token: string): number {
    if (token.length <= 2) return 0.5;
    if (token.length <= 4) return 1.0;
    return 1.0 + Math.log2(token.length) * 0.1;
  }

  private hashToken(token: string): string {
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

    const combined = part1 + part2;
    return this.padOrTrim(combined, this.hashSize);
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
    return binary.padEnd(this.hashSize, '0');
  }
}
