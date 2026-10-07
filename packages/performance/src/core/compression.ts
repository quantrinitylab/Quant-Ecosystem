// ============================================================================
// Performance Package - Compression Engine
// Huffman coding concept (gzip), dictionary-based (brotli), streaming support
// ============================================================================

import type { CompressionConfig, CompressionAlgorithm, CompressionResult } from '../types';

/** Huffman tree node for gzip simulation */
interface HuffmanNode {
  char: string | null;
  frequency: number;
  left: HuffmanNode | null;
  right: HuffmanNode | null;
}

/** Dictionary entry for brotli simulation */
interface DictionaryEntry {
  phrase: string;
  code: number;
  frequency: number;
}

/** Compression statistics */
interface CompressionStats {
  totalCompressed: number;
  totalOriginalSize: number;
  totalCompressedSize: number;
  averageRatio: number;
  byAlgorithm: Map<CompressionAlgorithm, { count: number; totalRatio: number }>;
}

/**
 * CompressionEngine implements compression simulation with Huffman coding
 * concept for gzip, dictionary-based compression for brotli, content-type
 * detection, threshold optimization, and streaming support.
 */
export class CompressionEngine {
  private readonly config: CompressionConfig;
  private readonly dictionary: Map<string, DictionaryEntry>;
  private readonly stats: CompressionStats;
  private readonly contentTypeMap: Map<string, CompressionAlgorithm>;

  constructor(config: Partial<CompressionConfig> = {}) {
    this.config = {
      algorithm: config.algorithm ?? 'GZIP',
      level: config.level ?? 6,
      minSize: config.minSize ?? 1024,
      contentTypes: config.contentTypes ?? [
        'text/html', 'text/css', 'text/javascript', 'application/json',
        'application/javascript', 'text/plain', 'image/svg+xml',
      ],
      enableStreaming: config.enableStreaming ?? true,
      dictionarySize: config.dictionarySize ?? 32768,
    };

    this.dictionary = new Map();
    this.initializeDictionary();

    this.stats = {
      totalCompressed: 0,
      totalOriginalSize: 0,
      totalCompressedSize: 0,
      averageRatio: 0,
      byAlgorithm: new Map(),
    };

    this.contentTypeMap = new Map([
      ['text/html', 'BROTLI'],
      ['text/css', 'BROTLI'],
      ['text/javascript', 'BROTLI'],
      ['application/json', 'GZIP'],
      ['application/javascript', 'GZIP'],
      ['text/plain', 'GZIP'],
      ['image/svg+xml', 'GZIP'],
    ]);
  }

  /**
   * Compress data using the configured algorithm.
   * Applies threshold check and content-type optimization.
   */
  compress(data: string, contentType?: string): CompressionResult {
    const originalSize = data.length;
    const startTime = Date.now();

    // Skip if below threshold
    if (originalSize < this.config.minSize) {
      return {
        originalSize,
        compressedSize: originalSize,
        ratio: 1.0,
        algorithm: this.config.algorithm,
        durationMs: 0,
      };
    }

    // Select optimal algorithm based on content type
    const algorithm = contentType
      ? this.selectAlgorithm(contentType)
      : this.config.algorithm;

    let compressedSize: number;

    switch (algorithm) {
      case 'GZIP':
        compressedSize = this.compressGzip(data);
        break;
      case 'BROTLI':
        compressedSize = this.compressBrotli(data);
        break;
      case 'DEFLATE':
        compressedSize = this.compressDeflate(data);
        break;
      case 'ZSTD':
        compressedSize = this.compressZstd(data);
        break;
      default:
        compressedSize = originalSize;
    }

    const durationMs = Date.now() - startTime;
    const ratio = compressedSize / originalSize;

    // Update stats
    this.updateStats(algorithm, originalSize, compressedSize);

    return {
      originalSize,
      compressedSize,
      ratio,
      algorithm,
      durationMs,
    };
  }

  /**
   * Streaming compression: process data in chunks.
   */
  compressStream(chunks: string[], contentType?: string): CompressionResult[] {
    const results: CompressionResult[] = [];
    let runningContext = '';

    for (const chunk of chunks) {
      // Use context from previous chunks for better compression
      const contextEnhanced = runningContext.slice(-256) + chunk;
      const result = this.compress(contextEnhanced, contentType);

      // Adjust for context overhead
      const adjustedResult: CompressionResult = {
        ...result,
        originalSize: chunk.length,
        compressedSize: Math.floor(result.compressedSize * (chunk.length / contextEnhanced.length)),
        ratio: result.ratio,
      };

      results.push(adjustedResult);
      runningContext += chunk;
    }

    return results;
  }

  /**
   * Determine if content should be compressed based on type and size.
   */
  shouldCompress(contentType: string, size: number): boolean {
    if (size < this.config.minSize) return false;
    if (!this.isCompressibleType(contentType)) return false;
    return true;
  }

  /**
   * Select the optimal algorithm for a content type.
   */
  selectAlgorithm(contentType: string): CompressionAlgorithm {
    return this.contentTypeMap.get(contentType) ?? this.config.algorithm;
  }

  /**
   * Calculate optimal compression level based on content analysis.
   */
  optimizeLevel(data: string): number {
    const entropy = this.calculateEntropy(data);
    const repetitionRatio = this.calculateRepetitionRatio(data);

    // High entropy (random data) benefits less from high compression levels
    if (entropy > 7.5) return 1;
    // High repetition benefits from higher levels
    if (repetitionRatio > 0.5) return 9;
    // Medium entropy - use default
    if (entropy > 5.0) return 4;
    // Low entropy - high compression
    return Math.min(9, Math.floor((1 - entropy / 8) * 9) + 1);
  }

  /**
   * Build a Huffman tree for the given data (gzip concept demonstration).
   */
  buildHuffmanTree(data: string): HuffmanNode | null {
    // Count character frequencies
    const frequencies = new Map<string, number>();
    for (const char of data) {
      frequencies.set(char, (frequencies.get(char) ?? 0) + 1);
    }

    // Build priority queue (sorted array simulation)
    const nodes: HuffmanNode[] = [];
    for (const [char, frequency] of frequencies) {
      nodes.push({ char, frequency, left: null, right: null });
    }

    if (nodes.length === 0) return null;

    // Build tree by combining lowest-frequency nodes
    while (nodes.length > 1) {
      nodes.sort((a, b) => a.frequency - b.frequency);
      const left = nodes.shift()!;
      const right = nodes.shift()!;
      const parent: HuffmanNode = {
        char: null,
        frequency: left.frequency + right.frequency,
        left,
        right,
      };
      nodes.push(parent);
    }

    return nodes[0];
  }

  /**
   * Generate Huffman codes from the tree.
   */
  generateHuffmanCodes(root: HuffmanNode | null): Map<string, string> {
    const codes = new Map<string, string>();
    if (!root) return codes;

    const traverse = (node: HuffmanNode, code: string): void => {
      if (node.char !== null) {
        codes.set(node.char, code || '0');
        return;
      }
      if (node.left) traverse(node.left, code + '0');
      if (node.right) traverse(node.right, code + '1');
    };

    traverse(root, '');
    return codes;
  }

  /**
   * Get compression statistics.
   */
  getStats(): CompressionStats {
    return {
      ...this.stats,
      byAlgorithm: new Map(this.stats.byAlgorithm),
    };
  }

  /**
   * Check if a content type is compressible.
   */
  isCompressibleType(contentType: string): boolean {
    const baseType = contentType.split(';')[0].trim().toLowerCase();
    return this.config.contentTypes.includes(baseType) ||
      baseType.startsWith('text/') ||
      baseType.includes('json') ||
      baseType.includes('xml') ||
      baseType.includes('javascript');
  }

  /** Reset statistics */
  resetStats(): void {
    this.stats.totalCompressed = 0;
    this.stats.totalOriginalSize = 0;
    this.stats.totalCompressedSize = 0;
    this.stats.averageRatio = 0;
    this.stats.byAlgorithm.clear();
  }

  // ===========================================================================
  // Private methods
  // ===========================================================================

  /** Simulate gzip compression using Huffman coding concept */
  private compressGzip(data: string): number {
    const tree = this.buildHuffmanTree(data);
    const codes = this.generateHuffmanCodes(tree);

    // Calculate compressed size in bits
    let totalBits = 0;
    for (const char of data) {
      const code = codes.get(char);
      totalBits += code ? code.length : 8;
    }

    // Add overhead for tree storage and headers
    const treeOverhead = codes.size * 10;
    const headerOverhead = 18; // gzip header bytes

    // Convert bits to bytes and add overhead
    const compressedBytes = Math.ceil(totalBits / 8) + treeOverhead + headerOverhead;

    // Apply compression level factor
    const levelFactor = 1 - (this.config.level / 10) * 0.3;
    return Math.max(Math.floor(compressedBytes * levelFactor), Math.floor(data.length * 0.1));
  }

  /** Simulate brotli compression using dictionary-based approach */
  private compressBrotli(data: string): number {
    let matchedLength = 0;

    // Dictionary matching
    for (const [phrase, entry] of this.dictionary) {
      let idx = data.indexOf(phrase);
      while (idx !== -1) {
        matchedLength += phrase.length;
        idx = data.indexOf(phrase, idx + phrase.length);
      }
    }

    // LZ77-style back-reference matching
    const backRefSavings = this.calculateBackReferences(data);

    // Brotli typically achieves 15-25% better than gzip
    const dictionaryRatio = matchedLength / data.length;
    const backRefRatio = backRefSavings / data.length;
    const baseRatio = 0.25 + (1 - dictionaryRatio) * 0.3 - backRefRatio * 0.15;
    const levelFactor = 1 - (this.config.level / 11) * 0.2;

    return Math.max(
      Math.floor(data.length * baseRatio * levelFactor),
      Math.floor(data.length * 0.08)
    );
  }

  /** Simulate deflate compression */
  private compressDeflate(data: string): number {
    // Deflate is LZ77 + Huffman without gzip wrapper
    const gzipSize = this.compressGzip(data);
    return Math.max(gzipSize - 18, Math.floor(data.length * 0.12)); // Remove gzip header overhead
  }

  /** Simulate zstd compression */
  private compressZstd(data: string): number {
    // Zstandard typically achieves similar or better ratios than brotli
    const brotliSize = this.compressBrotli(data);
    // Zstd excels at speed with similar ratios
    return Math.max(Math.floor(brotliSize * 0.95), Math.floor(data.length * 0.07));
  }

  /** Calculate back-reference savings (LZ77 concept) */
  private calculateBackReferences(data: string): number {
    let savings = 0;
    const windowSize = Math.min(32768, data.length);
    const minMatchLength = 3;

    for (let i = minMatchLength; i < data.length; i++) {
      const searchStart = Math.max(0, i - windowSize);
      const pattern = data.slice(i, i + minMatchLength);
      const searchWindow = data.slice(searchStart, i);

      const matchIdx = searchWindow.lastIndexOf(pattern);
      if (matchIdx !== -1) {
        // Found a back reference - count extra match length
        let matchLen = minMatchLength;
        while (
          i + matchLen < data.length &&
          searchStart + matchIdx + matchLen < i &&
          data[i + matchLen] === data[searchStart + matchIdx + matchLen]
        ) {
          matchLen++;
          if (matchLen > 258) break; // max match length
        }
        savings += matchLen - 3; // 3 bytes for the back-reference pointer
        i += matchLen - 1; // skip matched portion
      }
    }

    return savings;
  }

  /** Calculate Shannon entropy of data */
  private calculateEntropy(data: string): number {
    const frequencies = new Map<string, number>();
    for (const char of data) {
      frequencies.set(char, (frequencies.get(char) ?? 0) + 1);
    }

    let entropy = 0;
    const len = data.length;
    for (const count of frequencies.values()) {
      const probability = count / len;
      if (probability > 0) {
        entropy -= probability * Math.log2(probability);
      }
    }

    return entropy;
  }

  /** Calculate repetition ratio in data */
  private calculateRepetitionRatio(data: string): number {
    const uniqueChars = new Set(data).size;
    const totalChars = data.length;
    // Lower unique/total ratio means more repetition
    return 1 - (uniqueChars / Math.min(totalChars, 256));
  }

  /** Initialize common dictionary phrases for brotli */
  private initializeDictionary(): void {
    const commonPhrases = [
      'the ', 'and ', 'for ', 'that ', 'with ', 'this ', 'from ', 'have ',
      'class', 'function', 'return', 'export', 'import', 'const ', 'let ',
      'var ', 'http', 'www', '.com', '.html', '.css', '.js', 'div',
      'span', 'true', 'false', 'null', 'undefined', 'async', 'await',
      '{"', '"}', '":"', '","', '</div>', '<div', 'style=', 'class=',
    ];

    let code = 0;
    for (const phrase of commonPhrases) {
      this.dictionary.set(phrase, { phrase, code: code++, frequency: 0 });
    }
  }

  /** Update compression statistics */
  private updateStats(algorithm: CompressionAlgorithm, originalSize: number, compressedSize: number): void {
    this.stats.totalCompressed++;
    this.stats.totalOriginalSize += originalSize;
    this.stats.totalCompressedSize += compressedSize;
    this.stats.averageRatio = this.stats.totalCompressedSize / this.stats.totalOriginalSize;

    if (!this.stats.byAlgorithm.has(algorithm)) {
      this.stats.byAlgorithm.set(algorithm, { count: 0, totalRatio: 0 });
    }
    const algStats = this.stats.byAlgorithm.get(algorithm)!;
    algStats.count++;
    algStats.totalRatio += compressedSize / originalSize;
  }
}
