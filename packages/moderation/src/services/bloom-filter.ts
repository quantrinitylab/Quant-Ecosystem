// ============================================================================
// Moderation - Bloom Filter
// Space-efficient probabilistic data structure for known-bad hash lookup
// ============================================================================

/**
 * BloomFilter - Probabilistic set membership testing
 *
 * Used for cross-app known-bad hash lookup. Zero false negatives guaranteed;
 * false positives bounded by size and hash count parameters.
 * Supports serialization for sharing via Redis or shared storage.
 */
export class BloomFilter {
  private readonly bits: Uint8Array;
  private readonly size: number;
  private readonly hashCount: number;
  private itemCount: number;

  constructor(size: number = 10000, hashCount: number = 7) {
    this.size = size;
    this.hashCount = hashCount;
    this.bits = new Uint8Array(Math.ceil(size / 8));
    this.itemCount = 0;
  }

  /** Add a value to the filter */
  add(value: string): void {
    const positions = this.getHashPositions(value);
    for (const pos of positions) {
      const byteIndex = Math.floor(pos / 8);
      const bitIndex = pos % 8;
      this.bits[byteIndex] = (this.bits[byteIndex] ?? 0) | (1 << bitIndex);
    }
    this.itemCount++;
  }

  /** Check if a value might be in the filter (no false negatives) */
  has(value: string): boolean {
    const positions = this.getHashPositions(value);
    for (const pos of positions) {
      const byteIndex = Math.floor(pos / 8);
      const bitIndex = pos % 8;
      if (((this.bits[byteIndex] ?? 0) & (1 << bitIndex)) === 0) {
        return false;
      }
    }
    return true;
  }

  /** Estimate the current false positive rate */
  estimateFalsePositiveRate(): number {
    // Formula: (1 - e^(-kn/m))^k
    // k = hash count, n = item count, m = bit size
    const k = this.hashCount;
    const n = this.itemCount;
    const m = this.size;

    if (n === 0) return 0;

    const exponent = (-k * n) / m;
    const probability = Math.pow(1 - Math.exp(exponent), k);
    return probability;
  }

  /** Get the number of items added */
  getItemCount(): number {
    return this.itemCount;
  }

  /** Get the filter size in bits */
  getSize(): number {
    return this.size;
  }

  /** Get the number of hash functions */
  getHashCount(): number {
    return this.hashCount;
  }

  /** Serialize the bloom filter to a Buffer for cross-app sharing */
  serialize(): Buffer {
    // Header: 4 bytes size + 4 bytes hashCount + 4 bytes itemCount + bits
    const header = Buffer.alloc(12);
    header.writeUInt32LE(this.size, 0);
    header.writeUInt32LE(this.hashCount, 4);
    header.writeUInt32LE(this.itemCount, 8);
    return Buffer.concat([header, Buffer.from(this.bits)]);
  }

  /** Deserialize a bloom filter from a Buffer */
  static deserialize(buffer: Buffer): BloomFilter {
    const size = buffer.readUInt32LE(0);
    const hashCount = buffer.readUInt32LE(4);
    const itemCount = buffer.readUInt32LE(8);

    const filter = new BloomFilter(size, hashCount);
    const bitsData = buffer.subarray(12);
    for (let i = 0; i < bitsData.length && i < filter.bits.length; i++) {
      filter.bits[i] = bitsData[i] ?? 0;
    }
    filter.itemCount = itemCount;
    return filter;
  }

  // --- Private Methods ---

  private getHashPositions(value: string): number[] {
    const positions: number[] = [];
    // Use two base hashes to derive k hash positions (Kirsch-Mitzenmacher optimization)
    const h1 = this.fnv1a(value);
    const h2 = this.murmurLike(value);

    for (let i = 0; i < this.hashCount; i++) {
      const combined = Math.abs((h1 + i * h2) % this.size);
      positions.push(combined);
    }
    return positions;
  }

  private fnv1a(value: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  private murmurLike(value: string): number {
    let hash = 0x12345678;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 0x5bd1e995);
      hash ^= hash >>> 15;
    }
    return hash >>> 0 || 1; // Ensure non-zero for modular arithmetic
  }
}
