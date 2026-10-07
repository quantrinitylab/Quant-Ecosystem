// ============================================================================
// Security Package - CSRF Protection
// ============================================================================

import crypto from 'crypto';
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

    // Verify HMAC with a length-guarded constant-time comparison.
    const expectedHmac = this.computeHMAC(token, sessionId);
    const storedBuf = Buffer.from(storedToken.hmac, 'hex');
    const expectedBuf = Buffer.from(expectedHmac, 'hex');
    if (
      storedBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(storedBuf, expectedBuf)
    ) {
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

  /** Compute HMAC-SHA256 over token:sessionId, keyed by the configured secret */
  private computeHMAC(token: string, sessionId: string): string {
    return crypto
      .createHmac('sha256', this.config.secretKey)
      .update(`${token}:${sessionId}`)
      .digest('hex');
  }

  /** Generate a random token of specified length */
  private generateRandomToken(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let token = '';
    for (let i = 0; i < length; i++) {
      token += chars[crypto.randomInt(chars.length)];
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
