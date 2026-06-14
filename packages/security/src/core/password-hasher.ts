// ============================================================================
// Security Package - Password Hasher
// ============================================================================

import crypto from 'crypto';
import type { PasswordHashResult, Argon2Params, PasswordStrength } from '../types';

/** Default Argon2id parameters */
const DEFAULT_PARAMS: Argon2Params = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
};

/**
 * PasswordHasher - Memory-hard password hashing with Argon2id simulation,
 * salt generation, timing-safe comparison, and password strength scoring.
 */
export class PasswordHasher {
  private params: Argon2Params;
  private hashCount: number;
  private commonPasswords: Set<string>;

  constructor(params: Partial<Argon2Params> = {}) {
    this.params = { ...DEFAULT_PARAMS, ...params };
    this.hashCount = 0;
    this.commonPasswords = new Set([
      'password',
      '123456',
      '12345678',
      'qwerty',
      'abc123',
      'monkey',
      '1234567',
      'letmein',
      'trustno1',
      'dragon',
      'baseball',
      'iloveyou',
      'master',
      'sunshine',
      'ashley',
      'michael',
      'shadow',
      '123123',
      '654321',
      'superman',
      'qazwsx',
      'password1',
      'password123',
      'admin',
      'welcome',
      'hello',
      'charlie',
    ]);
  }

  /** Hash a password using Argon2id simulation */
  async hash(password: string): Promise<PasswordHashResult> {
    this.hashCount++;
    const salt = this.generateSalt(16);
    const now = Date.now();

    // Argon2id simulation: memory-hard iterative hashing
    const hash = this.argon2idHash(password, salt);

    return {
      hash,
      salt,
      algorithm: 'argon2id',
      version: 19,
      params: { ...this.params },
      createdAt: now,
    };
  }

  /** Verify a password against a stored hash */
  async verify(password: string, stored: PasswordHashResult): Promise<boolean> {
    // Re-hash with the stored salt and params
    const prevParams = { ...this.params };
    this.params = stored.params;

    const computedHash = this.argon2idHash(password, stored.salt);

    this.params = prevParams;

    // Timing-safe comparison
    return this.timingSafeEqual(computedHash, stored.hash);
  }

  /** Score password strength */
  assessStrength(password: string): PasswordStrength {
    let score = 0;
    const feedback: string[] = [];

    // Length scoring
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (password.length >= 16) score += 1;
    if (password.length < 8) feedback.push('Use at least 8 characters');

    // Character diversity
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasDigit = /[0-9]/.test(password);
    const hasSymbol = /[^a-zA-Z0-9]/.test(password);

    if (hasLower) score += 0.5;
    if (hasUpper) score += 0.5;
    if (hasDigit) score += 0.5;
    if (hasSymbol) score += 1;

    if (!hasUpper) feedback.push('Add uppercase letters');
    if (!hasDigit) feedback.push('Add numbers');
    if (!hasSymbol) feedback.push('Add special characters');

    // Common password check
    if (this.commonPasswords.has(password.toLowerCase())) {
      score = Math.max(0, score - 3);
      feedback.push('This is a commonly used password');
    }

    // Repeating characters
    if (/(.)\1{2,}/.test(password)) {
      score -= 0.5;
      feedback.push('Avoid repeating characters');
    }

    // Sequential characters
    if (/(?:abc|bcd|cde|def|efg|123|234|345|456|567|678|789)/i.test(password)) {
      score -= 0.5;
      feedback.push('Avoid sequential characters');
    }

    // Keyboard patterns
    if (/(?:qwert|asdf|zxcv|qwerty)/i.test(password)) {
      score -= 1;
      feedback.push('Avoid keyboard patterns');
    }

    // Calculate entropy
    const entropy = this.calculateEntropy(password);
    if (entropy > 60) score += 1;
    if (entropy > 80) score += 1;

    // Normalize score to 0-5
    const normalizedScore = Math.max(0, Math.min(5, Math.round(score)));

    const levels: ('very_weak' | 'weak' | 'fair' | 'strong' | 'very_strong')[] = [
      'very_weak',
      'weak',
      'fair',
      'strong',
      'very_strong',
    ];
    const level = levels[Math.min(normalizedScore, 4)]!;

    const crackTimes = ['instant', 'minutes', 'hours', 'days', 'years'];
    const crackTime = crackTimes[Math.min(normalizedScore, 4)]!;

    return { score: normalizedScore, level, feedback, entropy, crackTime };
  }

  /** Check if password appears in common breach lists (simulation) */
  async checkBreach(password: string): Promise<{ breached: boolean; count: number }> {
    // Simulate breach database check using hash prefix
    this.simpleHash(password.toLowerCase());

    // Simulate: common passwords are "breached"
    if (this.commonPasswords.has(password.toLowerCase())) {
      return { breached: true, count: Math.floor(Math.random() * 1000000) + 1000 };
    }

    // Very short passwords are likely breached
    if (password.length < 6) {
      return { breached: true, count: Math.floor(Math.random() * 500000) + 500 };
    }

    return { breached: false, count: 0 };
  }

  /** Argon2id simulation - memory-hard hashing */
  private argon2idHash(password: string, salt: string): string {
    const { memoryCost, timeCost, parallelism, hashLength } = this.params;

    // Initialize memory blocks (simulated - actual Argon2 uses large memory arrays)
    const blockSize = 1024;
    const blocks = Math.min(memoryCost / blockSize, 64); // Limit for simulation
    const memory: string[] = new Array(blocks);

    // Initial hash: H0 = H(password || salt || params)
    let h0 = this.multiRoundHash(`${password}|${salt}|${memoryCost}|${timeCost}|${parallelism}`);

    // Fill memory blocks (data-independent addressing for Argon2id first pass)
    for (let i = 0; i < blocks; i++) {
      memory[i] = this.multiRoundHash(h0 + i.toString());
    }

    // Iterate (time cost)
    for (let t = 0; t < timeCost; t++) {
      for (let i = 0; i < blocks; i++) {
        // Argon2id: first half data-independent, second half data-dependent
        const refIndex =
          t < timeCost / 2
            ? (i + 1) % blocks
            : Math.abs(parseInt(memory[i]!.substring(0, 8), 16)) % blocks;

        // Mix blocks (simulating Blake2b compression)
        memory[i] = this.multiRoundHash(memory[i]! + memory[refIndex]! + t.toString());
      }
    }

    // Final hash: XOR all blocks and hash
    let finalBlock = memory[0]!;
    for (let i = 1; i < blocks; i++) {
      finalBlock = this.xorStrings(finalBlock, memory[i]!);
    }

    // Truncate to desired hash length
    const fullHash = this.multiRoundHash(finalBlock + salt);
    return fullHash.substring(0, hashLength * 2);
  }

  /** Multi-round hash function */
  private multiRoundHash(input: string): string {
    let h1 = 0x6a09e667;
    let h2 = 0xbb67ae85;
    let h3 = 0x3c6ef372;
    let h4 = 0xa54ff53a;
    let h5 = 0x510e527f;
    let h6 = 0x9b05688c;
    let h7 = 0x1f83d9ab;
    let h8 = 0x5be0cd19;

    for (let round = 0; round < 4; round++) {
      for (let i = 0; i < input.length; i++) {
        const c = input.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
        h2 = Math.imul(h2 ^ (c + round), 0x5bd1e995) >>> 0;
        h3 = Math.imul(h3 ^ (c * (i + 1)), 0x1b873593) >>> 0;
        h4 = Math.imul(h4 ^ (c ^ round), 0xcc9e2d51) >>> 0;
        h5 = Math.imul(h5 ^ (c + i), 0x85ebca6b) >>> 0;
        h6 = Math.imul(h6 ^ (c * round), 0xc2b2ae35) >>> 0;
        h7 = Math.imul(h7 ^ (c + 7), 0x27d4eb2f) >>> 0;
        h8 = Math.imul(h8 ^ (c ^ i), 0x165667b1) >>> 0;
      }
      h1 ^= h5 >>> 13;
      h2 ^= h6 >>> 7;
      h3 ^= h7 >>> 17;
      h4 ^= h8 >>> 11;
      h5 ^= h1 >>> 5;
      h6 ^= h2 >>> 19;
      h7 ^= h3 >>> 3;
      h8 ^= h4 >>> 23;
    }

    return [h1, h2, h3, h4, h5, h6, h7, h8]
      .map((h) => (h >>> 0).toString(16).padStart(8, '0'))
      .join('');
  }

  /** XOR two hex strings */
  private xorStrings(a: string, b: string): string {
    const len = Math.min(a.length, b.length);
    let result = '';
    for (let i = 0; i < len; i += 2) {
      const byteA = parseInt(a.substring(i, i + 2), 16) || 0;
      const byteB = parseInt(b.substring(i, i + 2), 16) || 0;
      result += (byteA ^ byteB).toString(16).padStart(2, '0');
    }
    return result;
  }

  /** Calculate password entropy */
  private calculateEntropy(password: string): number {
    let charset = 0;
    if (/[a-z]/.test(password)) charset += 26;
    if (/[A-Z]/.test(password)) charset += 26;
    if (/[0-9]/.test(password)) charset += 10;
    if (/[^a-zA-Z0-9]/.test(password)) charset += 32;
    return charset > 0 ? password.length * Math.log2(charset) : 0;
  }

  /** Generate cryptographic salt */
  private generateSalt(length: number): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /** Timing-safe string comparison */
  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }

  /** Simple hash for breach checking */
  private simpleHash(input: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  /** Get hasher statistics */
  getStats(): { totalHashes: number; params: Argon2Params } {
    return { totalHashes: this.hashCount, params: { ...this.params } };
  }
}
