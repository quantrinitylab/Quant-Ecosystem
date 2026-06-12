// ============================================================================
// Security Package - CSRF Protection
// ============================================================================

import type { CSRFToken, CSRFConfig } from '../types';

/** Default CSRF configuration */
const DEFAULT_CONFIG: CSRFConfig = {
  tokenLength: 32,
  tokenExpiry: 3600000,
  cookieName: '__csrf_token',
  headerName: 'x-csrf-token',
  secretKey: 'default-secret-change-in-production',
  sameSite: 'strict',
  secure: true,
};

/**
 * CSRFManager - CSRF protection using double-submit cookie pattern with HMAC tokens.
 * Generates per-session tokens, validates submissions, and handles token rotation.
 */
export class CSRFManager {
  private config: CSRFConfig;
  private tokens: Map<string, CSRFToken>;
  private sessionTokens: Map<string, string[]>;
  private usedTokens: Set<string>;

  constructor(config: Partial<CSRFConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (
      process.env.NODE_ENV === 'production' &&
      this.config.secretKey === DEFAULT_CONFIG.secretKey
    ) {
      throw new Error('CSRFManager requires an explicit secretKey in production');
    }
    this.tokens = new Map();
    this.sessionTokens = new Map();
    this.usedTokens = new Set();
  }

  /** Generate a new CSRF token for a session */
  async generateToken(sessionId: string): Promise<{ token: string; cookie: string }> {
    const now = Date.now();
    const tokenValue = this.generateRandomToken(this.config.tokenLength);
    const hmac = this.computeHMAC(tokenValue, sessionId);

    const csrfToken: CSRFToken = {
      token: tokenValue,
      sessionId,
      createdAt: now,
      expiresAt: now + this.config.tokenExpiry,
      used: false,
      hmac,
    };

    this.tokens.set(tokenValue, csrfToken);

    // Track tokens per session
    const sessionList = this.sessionTokens.get(sessionId) || [];
    sessionList.push(tokenValue);
    // Keep max 10 active tokens per session
    if (sessionList.length > 10) {
      const removed = sessionList.shift()!;
      this.tokens.delete(removed);
    }
    this.sessionTokens.set(sessionId, sessionList);

    const cookie = this.buildCookieString(tokenValue);
    return { token: tokenValue, cookie };
  }

  /** Validate a submitted CSRF token */
  async validateToken(
    token: string,
    sessionId: string,
    headerToken?: string,
  ): Promise<{
    valid: boolean;
    reason: string;
  }> {
    // Double-submit check: header must match cookie token
    if (headerToken && headerToken !== token) {
      return { valid: false, reason: 'token_mismatch' };
    }

    const storedToken = this.tokens.get(token);
    if (!storedToken) {
      return { valid: false, reason: 'token_not_found' };
    }

    // Check expiry
    const now = Date.now();
    if (now > storedToken.expiresAt) {
      this.tokens.delete(token);
      return { valid: false, reason: 'token_expired' };
    }

    // Check session binding
    if (storedToken.sessionId !== sessionId) {
      return { valid: false, reason: 'session_mismatch' };
    }

    // Check if already used (prevent replay)
    if (storedToken.used || this.usedTokens.has(token)) {
      return { valid: false, reason: 'token_already_used' };
    }

    // Verify HMAC
    const expectedHmac = this.computeHMAC(token, sessionId);
    if (!this.timingSafeEqual(storedToken.hmac, expectedHmac)) {
      return { valid: false, reason: 'hmac_invalid' };
    }

    // Mark as used
    storedToken.used = true;
    this.usedTokens.add(token);

    return { valid: true, reason: 'valid' };
  }

  /** Rotate all tokens for a session (e.g., after privilege change) */
  async rotateTokens(sessionId: string): Promise<{ token: string; cookie: string }> {
    // Invalidate all existing tokens for this session
    const existingTokens = this.sessionTokens.get(sessionId) || [];
    for (const tokenValue of existingTokens) {
      this.tokens.delete(tokenValue);
    }
    this.sessionTokens.delete(sessionId);

    // Generate a fresh token
    return this.generateToken(sessionId);
  }

  /** Invalidate all tokens for a session */
  async invalidateSession(sessionId: string): Promise<void> {
    const existingTokens = this.sessionTokens.get(sessionId) || [];
    for (const tokenValue of existingTokens) {
      this.tokens.delete(tokenValue);
    }
    this.sessionTokens.delete(sessionId);
  }

  /** Build a Set-Cookie string for the CSRF token */
  private buildCookieString(token: string): string {
    const parts = [
      `${this.config.cookieName}=${token}`,
      'Path=/',
      `SameSite=${this.config.sameSite}`,
    ];

    if (this.config.secure) {
      parts.push('Secure');
    }
    parts.push('HttpOnly');

    return parts.join('; ');
  }

  /** Compute HMAC-SHA256 simulation for token integrity */
  private computeHMAC(token: string, sessionId: string): string {
    const message = `${token}:${sessionId}:${this.config.secretKey}`;
    return this.sha256Simulate(message);
  }

  /** SHA-256 simulation using FNV-1a variant for deterministic hashing */
  private sha256Simulate(input: string): string {
    // Multi-round hash to simulate SHA-256 output
    let h1 = 0x6a09e667;
    let h2 = 0xbb67ae85;
    let h3 = 0x3c6ef372;
    let h4 = 0xa54ff53a;

    for (let round = 0; round < 4; round++) {
      for (let i = 0; i < input.length; i++) {
        const ch = input.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 0x01000193);
        h2 = Math.imul(h2 ^ (ch + round), 0x5bd1e995);
        h3 = Math.imul(h3 ^ (ch * (i + 1)), 0x1b873593);
        h4 = Math.imul(h4 ^ (ch ^ (i * round)), 0xcc9e2d51);
      }
      // Mix
      h1 ^= h2 >>> 13;
      h2 ^= h3 >>> 7;
      h3 ^= h4 >>> 17;
      h4 ^= h1 >>> 11;
    }

    return [
      (h1 >>> 0).toString(16).padStart(8, '0'),
      (h2 >>> 0).toString(16).padStart(8, '0'),
      (h3 >>> 0).toString(16).padStart(8, '0'),
      (h4 >>> 0).toString(16).padStart(8, '0'),
    ].join('');
  }

  /** Timing-safe string comparison to prevent timing attacks */
  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }

  /** Generate a random token of specified length */
  private generateRandomToken(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let token = '';
    for (let i = 0; i < length; i++) {
      token += chars[Math.floor(Math.random() * chars.length)];
    }
    return token;
  }

  /** Cleanup expired tokens */
  async cleanup(): Promise<{ removed: number }> {
    const now = Date.now();
    let removed = 0;

    for (const [key, token] of this.tokens) {
      if (now > token.expiresAt) {
        this.tokens.delete(key);
        removed++;
      }
    }

    // Clean used tokens older than 1 hour
    if (this.usedTokens.size > 10000) {
      this.usedTokens.clear();
    }

    return { removed };
  }

  /** Get active token count for a session */
  getSessionTokenCount(sessionId: string): number {
    return (this.sessionTokens.get(sessionId) || []).length;
  }

  /** Get total active token count */
  getTotalTokenCount(): number {
    return this.tokens.size;
  }
}
