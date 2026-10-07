// ============================================================================
// Security Package - OAuth2 Security
// ============================================================================

import crypto from 'node:crypto';
import type { OAuth2Config, PKCEChallenge, OAuth2AuthRequest } from '../types';

/** Default OAuth2 configuration */
const DEFAULT_CONFIG: OAuth2Config = {
  clientId: '',
  clientSecret: '',
  redirectUris: [],
  allowedScopes: ['read', 'write', 'admin'],
  tokenExpiry: 3600000,
  refreshTokenExpiry: 86400000 * 30,
  requirePKCE: true,
  requireState: true,
};

/**
 * OAuth2Security - Complete OAuth2 security implementation with PKCE (S256),
 * state parameter validation, token binding, nonce generation, and redirect URI validation.
 */
export class OAuth2Security {
  private config: OAuth2Config;
  private authRequests: Map<string, OAuth2AuthRequest>;
  private pkceChallenges: Map<string, PKCEChallenge>;
  private stateTokens: Map<string, { createdAt: number; used: boolean; clientId: string }>;
  private nonces: Map<string, { createdAt: number; used: boolean }>;
  private authCodes: Map<
    string,
    {
      clientId: string;
      scopes: string[];
      codeChallenge?: string;
      redirectUri: string;
      expiresAt: number;
    }
  >;
  private tokenBindings: Map<string, { clientId: string; userId: string; scopes: string[] }>;

  constructor(config: Partial<OAuth2Config> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.authRequests = new Map();
    this.pkceChallenges = new Map();
    this.stateTokens = new Map();
    this.nonces = new Map();
    this.authCodes = new Map();
    this.tokenBindings = new Map();
  }

  /** Generate PKCE challenge pair (code_verifier + code_challenge using S256) */
  generatePKCE(): PKCEChallenge {
    const now = Date.now();
    const codeVerifier = this.generateSecureRandom(43); // RFC 7636: 43-128 chars

    // S256: code_challenge = BASE64URL(SHA256(code_verifier))
    const codeChallenge = this.computeS256Challenge(codeVerifier);

    const pkce: PKCEChallenge = {
      codeVerifier,
      codeChallenge,
      method: 'S256',
      createdAt: now,
      expiresAt: now + 600000, // 10 minutes
    };

    this.pkceChallenges.set(codeChallenge, pkce);
    return pkce;
  }

  /** Validate PKCE code_verifier against stored code_challenge */
  validatePKCE(codeVerifier: string, codeChallenge: string): boolean {
    const computedChallenge = this.computeS256Challenge(codeVerifier);
    return this.timingSafeEqual(computedChallenge, codeChallenge);
  }

  /** Generate a state parameter for CSRF protection in OAuth flow */
  generateState(clientId: string): string {
    const state = this.generateSecureRandom(32);
    this.stateTokens.set(state, {
      createdAt: Date.now(),
      used: false,
      clientId,
    });
    return state;
  }

  /** Validate state parameter from callback */
  validateState(state: string, clientId: string): boolean {
    const stored = this.stateTokens.get(state);
    if (!stored) return false;

    // Check expiry (5 minutes)
    if (Date.now() - stored.createdAt > 300000) {
      this.stateTokens.delete(state);
      return false;
    }

    // Check if already used (prevent replay)
    if (stored.used) return false;

    // Validate client binding
    if (stored.clientId !== clientId) return false;

    stored.used = true;
    return true;
  }

  /** Generate a nonce for token requests */
  generateNonce(): string {
    const nonce = this.generateSecureRandom(24);
    this.nonces.set(nonce, { createdAt: Date.now(), used: false });
    return nonce;
  }

  /** Validate a nonce */
  validateNonce(nonce: string): boolean {
    const stored = this.nonces.get(nonce);
    if (!stored) return false;
    if (stored.used) return false;
    if (Date.now() - stored.createdAt > 300000) {
      this.nonces.delete(nonce);
      return false;
    }
    stored.used = true;
    return true;
  }

  /** Validate a redirect URI against registered URIs */
  validateRedirectUri(uri: string, _clientId?: string): { valid: boolean; reason: string } {
    if (!uri) {
      return { valid: false, reason: 'missing_redirect_uri' };
    }

    // Must be absolute URI
    if (!uri.startsWith('http://') && !uri.startsWith('https://')) {
      // Allow custom schemes for native apps
      if (!uri.includes('://')) {
        return { valid: false, reason: 'invalid_uri_format' };
      }
    }

    // Block fragment component
    if (uri.includes('#')) {
      return { valid: false, reason: 'fragment_not_allowed' };
    }

    // Check against registered URIs (exact match required)
    if (this.config.redirectUris.length > 0) {
      const normalizedUri = this.normalizeUri(uri);
      const match = this.config.redirectUris.some(
        (registered) => this.normalizeUri(registered) === normalizedUri,
      );
      if (!match) {
        return { valid: false, reason: 'uri_not_registered' };
      }
    }

    // Block localhost in production (unless explicitly registered)
    if (uri.includes('localhost') || uri.includes('127.0.0.1')) {
      if (
        !this.config.redirectUris.some((r) => r.includes('localhost') || r.includes('127.0.0.1'))
      ) {
        return { valid: false, reason: 'localhost_not_allowed' };
      }
    }

    // HTTPS required for non-localhost
    if (uri.startsWith('http://') && !uri.includes('localhost') && !uri.includes('127.0.0.1')) {
      return { valid: false, reason: 'https_required' };
    }

    return { valid: true, reason: 'valid' };
  }

  /** Validate requested scopes against allowed scopes */
  validateScopes(requestedScopes: string[]): { valid: boolean; invalid: string[] } {
    const invalid: string[] = [];
    for (const scope of requestedScopes) {
      if (!this.config.allowedScopes.includes(scope)) {
        invalid.push(scope);
      }
    }
    return { valid: invalid.length === 0, invalid };
  }

  /** Create an authorization request */
  async createAuthRequest(params: {
    clientId: string;
    redirectUri: string;
    scope: string[];
    responseType: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
  }): Promise<{ requestId: string; authRequest: OAuth2AuthRequest } | { error: string }> {
    // Validate redirect URI
    const uriCheck = this.validateRedirectUri(params.redirectUri, params.clientId);
    if (!uriCheck.valid) {
      return { error: `Invalid redirect URI: ${uriCheck.reason}` };
    }

    // Validate scopes
    const scopeCheck = this.validateScopes(params.scope);
    if (!scopeCheck.valid) {
      return { error: `Invalid scopes: ${scopeCheck.invalid.join(', ')}` };
    }

    // Require PKCE if configured
    if (this.config.requirePKCE && !params.codeChallenge) {
      return { error: 'PKCE code_challenge required' };
    }

    // Validate code challenge method
    if (params.codeChallengeMethod && params.codeChallengeMethod !== 'S256') {
      return { error: 'Only S256 code_challenge_method is supported' };
    }

    const state = this.generateState(params.clientId);
    const nonce = this.generateNonce();

    const authRequest: OAuth2AuthRequest = {
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      scope: params.scope,
      state,
      nonce,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod || 'S256',
      responseType: params.responseType,
    };

    const requestId = this.generateSecureRandom(16);
    this.authRequests.set(requestId, authRequest);

    return { requestId, authRequest };
  }

  /** Issue authorization code after user consent */
  async issueAuthCode(requestId: string): Promise<string | null> {
    const request = this.authRequests.get(requestId);
    if (!request) return null;

    const code = this.generateSecureRandom(32);
    this.authCodes.set(code, {
      clientId: request.clientId,
      scopes: request.scope,
      codeChallenge: request.codeChallenge,
      redirectUri: request.redirectUri,
      expiresAt: Date.now() + 600000, // 10 minutes
    });

    this.authRequests.delete(requestId);
    return code;
  }

  /** Exchange authorization code for token (with PKCE validation) */
  async exchangeCode(
    code: string,
    codeVerifier: string,
    redirectUri: string,
    clientId: string,
  ): Promise<{
    success: boolean;
    error?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
  }> {
    const stored = this.authCodes.get(code);
    if (!stored) {
      return { success: false, error: 'invalid_code' };
    }

    // Check expiry
    if (Date.now() > stored.expiresAt) {
      this.authCodes.delete(code);
      return { success: false, error: 'code_expired' };
    }

    // Validate client
    if (stored.clientId !== clientId) {
      return { success: false, error: 'client_mismatch' };
    }

    // Validate redirect URI
    if (stored.redirectUri !== redirectUri) {
      return { success: false, error: 'redirect_uri_mismatch' };
    }

    // Validate PKCE
    if (stored.codeChallenge) {
      if (!this.validatePKCE(codeVerifier, stored.codeChallenge)) {
        return { success: false, error: 'pkce_validation_failed' };
      }
    }

    // Issue tokens
    const accessToken = this.generateSecureRandom(40);
    const refreshToken = this.generateSecureRandom(40);

    // Bind token
    this.tokenBindings.set(accessToken, {
      clientId,
      userId: '', // Would come from auth session
      scopes: stored.scopes,
    });

    // Remove used code
    this.authCodes.delete(code);

    return {
      success: true,
      accessToken,
      refreshToken,
      expiresIn: this.config.tokenExpiry / 1000,
    };
  }

  /** Validate an access token */
  validateToken(token: string): {
    valid: boolean;
    binding?: { clientId: string; scopes: string[] };
  } {
    const binding = this.tokenBindings.get(token);
    if (!binding) return { valid: false };
    return { valid: true, binding: { clientId: binding.clientId, scopes: binding.scopes } };
  }

  /**
   * Compute the RFC 7636 PKCE S256 challenge from a verifier:
   * code_challenge = BASE64URL-ENCODE(SHA256(ASCII(code_verifier)))
   * Uses Node's built-in crypto for a real SHA-256 and unpadded base64url output.
   */
  private computeS256Challenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  /** Normalize URI for comparison */
  private normalizeUri(uri: string): string {
    try {
      // Remove trailing slashes, lowercase scheme and host
      let normalized = uri.trim();
      while (normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
      }
      const parts = normalized.match(/^(https?:\/\/)([^/]+)(.*)/i);
      if (parts) {
        return parts[1]!.toLowerCase() + parts[2]!.toLowerCase() + parts[3]!;
      }
      return normalized;
    } catch {
      return uri;
    }
  }

  /** Generate secure random string */
  private generateSecureRandom(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const bytes = crypto.randomBytes(length);
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[bytes[i]! % chars.length];
    }
    return result;
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

  /** Cleanup expired data */
  async cleanup(): Promise<void> {
    const now = Date.now();

    for (const [key, val] of this.stateTokens) {
      if (now - val.createdAt > 300000) this.stateTokens.delete(key);
    }
    for (const [key, val] of this.nonces) {
      if (now - val.createdAt > 300000) this.nonces.delete(key);
    }
    for (const [key, val] of this.authCodes) {
      if (now > val.expiresAt) this.authCodes.delete(key);
    }
    for (const [key, val] of this.pkceChallenges) {
      if (now > val.expiresAt) this.pkceChallenges.delete(key);
    }
  }

  /** Get stats */
  getStats(): { activeRequests: number; pendingCodes: number; activeTokens: number } {
    return {
      activeRequests: this.authRequests.size,
      pendingCodes: this.authCodes.size,
      activeTokens: this.tokenBindings.size,
    };
  }
}
