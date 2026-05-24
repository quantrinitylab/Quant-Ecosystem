// ============================================================================
// Auth - Token Service (JWT management)
// ============================================================================

import type { AuthConfig, TokenPair, TokenPayload, RefreshTokenPayload } from '../types';
import type { PermissionScope, QuantApp } from '@quant/common';

/** Revoked token tracking */
interface RevokedToken {
  tokenId: string;
  revokedAt: Date;
  reason: string;
}

/**
 * Token Service
 *
 * Handles JWT token creation, validation, and refresh for the Quant Ecosystem.
 * Implements:
 * - Access token generation with claims
 * - Refresh token rotation (one-time use)
 * - Token revocation and blacklisting
 * - Token family tracking for refresh token reuse detection
 */
export class TokenService {
  private config: AuthConfig;
  private revokedTokens: Map<string, RevokedToken> = new Map();
  private refreshTokenFamilies: Map<string, { userId: string; currentTokenId: string; isRevoked: boolean }> = new Map();
  private activeRefreshTokens: Map<string, RefreshTokenPayload & { userId: string }> = new Map();

  constructor(config: AuthConfig) {
    this.config = config;
  }

  /**
   * Generate an access token + refresh token pair
   */
  async generateTokenPair(
    userId: string,
    userInfo: { email: string; username: string; role: string },
    scopes: PermissionScope[],
    app: QuantApp
  ): Promise<TokenPair> {
    const tokenId = this.generateTokenId();
    const refreshTokenId = this.generateTokenId();
    const familyId = this.generateTokenId();
    const now = Math.floor(Date.now() / 1000);

    // Access token payload
    const accessPayload: TokenPayload = {
      sub: userId,
      email: userInfo.email,
      username: userInfo.username,
      role: userInfo.role,
      scopes,
      app,
      iat: now,
      exp: now + this.config.accessTokenExpiresIn,
      iss: this.config.issuer,
      aud: this.config.audience,
      jti: tokenId,
    };

    // Refresh token payload
    const refreshPayload: RefreshTokenPayload = {
      sub: userId,
      jti: refreshTokenId,
      family: familyId,
      iat: now,
      exp: now + this.config.refreshTokenExpiresIn,
    };

    // Track refresh token family
    this.refreshTokenFamilies.set(familyId, {
      userId,
      currentTokenId: refreshTokenId,
      isRevoked: false,
    });

    // Store refresh token
    this.activeRefreshTokens.set(refreshTokenId, {
      ...refreshPayload,
      userId,
    });

    // Encode tokens (simplified JWT-like encoding)
    const accessToken = this.encodeToken(accessPayload);
    const refreshToken = this.encodeToken(refreshPayload);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.accessTokenExpiresIn,
      tokenType: 'Bearer',
    };
  }

  /**
   * Validate an access token and return its payload
   */
  async validateAccessToken(token: string): Promise<TokenPayload | null> {
    try {
      const payload = this.decodeToken<TokenPayload>(token);
      if (!payload) return null;

      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) return null;

      // Check if token is revoked
      if (this.revokedTokens.has(payload.jti)) return null;

      // Validate issuer and audience
      if (payload.iss !== this.config.issuer) return null;
      if (payload.aud !== this.config.audience) return null;

      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Refresh tokens using a refresh token (implements rotation)
   */
  async refreshTokens(refreshToken: string): Promise<TokenPair | null> {
    try {
      const payload = this.decodeToken<RefreshTokenPayload>(refreshToken);
      if (!payload) return null;

      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) return null;

      // Find the token in active tokens
      const storedToken = this.activeRefreshTokens.get(payload.jti);
      if (!storedToken) return null;

      // Check if family is revoked (refresh token reuse detection)
      const family = this.refreshTokenFamilies.get(payload.family);
      if (!family || family.isRevoked) {
        // Potential token theft! Revoke entire family
        if (family) {
          await this.revokeFamily(payload.family);
        }
        return null;
      }

      // Verify this is the current token in the family (rotation check)
      if (family.currentTokenId !== payload.jti) {
        // Token reuse detected! Revoke entire family
        await this.revokeFamily(payload.family);
        return null;
      }

      // Invalidate old refresh token
      this.activeRefreshTokens.delete(payload.jti);

      // Generate new token pair with same family
      const newRefreshTokenId = this.generateTokenId();
      const newTokenId = this.generateTokenId();

      // Update family
      family.currentTokenId = newRefreshTokenId;

      // Generate new access token
      const accessPayload: TokenPayload = {
        sub: storedToken.userId,
        email: '',
        username: '',
        role: 'user',
        scopes: ['profile:read'] as PermissionScope[],
        app: 'quantmail' as QuantApp,
        iat: now,
        exp: now + this.config.accessTokenExpiresIn,
        iss: this.config.issuer,
        aud: this.config.audience,
        jti: newTokenId,
      };

      // Generate new refresh token
      const newRefreshPayload: RefreshTokenPayload = {
        sub: storedToken.userId,
        jti: newRefreshTokenId,
        family: payload.family,
        iat: now,
        exp: now + this.config.refreshTokenExpiresIn,
      };

      // Store new refresh token
      this.activeRefreshTokens.set(newRefreshTokenId, {
        ...newRefreshPayload,
        userId: storedToken.userId,
      });

      return {
        accessToken: this.encodeToken(accessPayload),
        refreshToken: this.encodeToken(newRefreshPayload),
        expiresIn: this.config.accessTokenExpiresIn,
        tokenType: 'Bearer',
      };
    } catch {
      return null;
    }
  }

  /**
   * Revoke a specific token
   */
  async revokeToken(tokenId: string, reason: string = 'manual_revocation'): Promise<void> {
    this.revokedTokens.set(tokenId, {
      tokenId,
      revokedAt: new Date(),
      reason,
    });
  }

  /**
   * Revoke all tokens for a user
   */
  async revokeAllForUser(userId: string): Promise<void> {
    // Revoke all refresh token families for this user
    for (const [familyId, family] of this.refreshTokenFamilies) {
      if (family.userId === userId) {
        family.isRevoked = true;
      }
    }

    // Remove all active refresh tokens for this user
    for (const [tokenId, token] of this.activeRefreshTokens) {
      if (token.userId === userId) {
        this.activeRefreshTokens.delete(tokenId);
      }
    }
  }

  /**
   * Revoke an entire refresh token family (used for theft detection)
   */
  private async revokeFamily(familyId: string): Promise<void> {
    const family = this.refreshTokenFamilies.get(familyId);
    if (family) {
      family.isRevoked = true;
      // Remove all tokens in this family
      for (const [tokenId, token] of this.activeRefreshTokens) {
        if (token.family === familyId) {
          this.activeRefreshTokens.delete(tokenId);
        }
      }
    }
  }

  /**
   * Encode a payload into a JWT-like token string
   * In production, use proper JWT library (jose, jsonwebtoken)
   */
  private encodeToken<T extends object>(payload: T): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const headerB64 = this.base64UrlEncode(JSON.stringify(header));
    const payloadB64 = this.base64UrlEncode(JSON.stringify(payload));
    const signature = this.sign(`${headerB64}.${payloadB64}`);
    return `${headerB64}.${payloadB64}.${signature}`;
  }

  /**
   * Decode a JWT-like token string
   */
  private decodeToken<T>(token: string): T | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(this.base64UrlDecode(parts[1]));
      // Verify signature
      const expectedSignature = this.sign(`${parts[0]}.${parts[1]}`);
      if (parts[2] !== expectedSignature) return null;
      return payload as T;
    } catch {
      return null;
    }
  }

  /**
   * Base64URL encode
   */
  private base64UrlEncode(str: string): string {
    const base64 = Buffer.from(str).toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Base64URL decode
   */
  private base64UrlDecode(str: string): string {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const padding = base64.length % 4;
    if (padding) {
      base64 += '='.repeat(4 - padding);
    }
    return Buffer.from(base64, 'base64').toString();
  }

  /**
   * HMAC-like signing (simplified)
   * In production, use crypto.createHmac('sha256', secret)
   */
  private sign(data: string): string {
    let hash = 0;
    const combined = data + this.config.jwtSecret;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return Math.abs(hash).toString(36).padStart(8, '0');
  }

  /**
   * Generate a unique token ID
   */
  private generateTokenId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 14);
    return `tok_${timestamp}${random}`;
  }

  /**
   * Cleanup expired tokens and revocations
   */
  cleanup(): void {
    const now = Math.floor(Date.now() / 1000);

    // Clean up expired refresh tokens
    for (const [tokenId, token] of this.activeRefreshTokens) {
      if (token.exp < now) {
        this.activeRefreshTokens.delete(tokenId);
      }
    }

    // Clean up old revocations (older than 24 hours)
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    for (const [tokenId, revocation] of this.revokedTokens) {
      if (revocation.revokedAt < cutoff) {
        this.revokedTokens.delete(tokenId);
      }
    }
  }
}
