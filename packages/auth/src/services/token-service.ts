// ============================================================================
// Auth - Token Service (Production Prisma-backed version)
// ============================================================================

import * as jose from 'jose';
import { createHash } from 'node:crypto';
import type { AuthConfig, TokenPair, TokenPayload, RefreshTokenPayload } from '../types';
import type { PermissionScope, QuantApp } from '@quant/common';
import { generateId } from '../crypto/secure-random';
import { PrismaClient } from '@prisma/client';
import prisma from '../lib/prisma';
import { EnvConfigJwtKms } from '../lib/jwt-kms';
import type { JwtKms, JwtKeyPurpose, JwtKeyVersion } from '../lib/jwt-kms';

interface JWKSKeyPair {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}

const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export interface TokenServiceOptions {
  /**
   * KMS provider used to resolve the JWT signing/verification keys at runtime.
   * Defaults to an env/config-backed provider derived from `config`. Inject a
   * vault-backed provider (e.g. `VaultJwtKms`) in production for KMS-managed,
   * rotatable keys.
   */
  kms?: JwtKms;
}

export class TokenService {
  private config: AuthConfig;
  private prisma: PrismaClient;
  private kms: JwtKms;
  private jwksKeyPair: JWKSKeyPair | null = null;

  constructor(config: AuthConfig, prismaClient?: PrismaClient, options?: TokenServiceOptions) {
    this.config = config;
    this.prisma = prismaClient || prisma;
    // Keys are never captured as a static literal: the KMS resolves the current
    // key material on every sign/verify call (Requirement 2.1), supporting
    // rotation with a previous-key grace window (Requirement 2.2).
    this.kms =
      options?.kms ??
      new EnvConfigJwtKms({
        accessSecret: config.jwtSecret,
        refreshSecret: config.jwtRefreshSecret,
      });
  }

  /**
   * Verify a token against the KMS-resolved key set for a purpose. The token's
   * `kid` header selects the exact key; legacy/kid-less tokens fall back to
   * trying every currently-valid key (active first, then the rotation-grace
   * previous key) so tokens signed under a rotated-out key still verify until
   * they expire.
   */
  private async verifyWithKms(
    token: string,
    purpose: JwtKeyPurpose,
    options?: jose.JWTVerifyOptions,
  ): Promise<jose.JWTVerifyResult> {
    let kid: string | undefined;
    try {
      const header = jose.decodeProtectedHeader(token);
      kid = typeof header.kid === 'string' ? header.kid : undefined;
    } catch {
      kid = undefined;
    }

    const candidates: JwtKeyVersion[] = [];
    if (kid) {
      const byId = await this.kms.getKeyById(purpose, kid);
      if (byId) {
        candidates.push(byId);
      }
    }
    if (candidates.length === 0) {
      candidates.push(...(await this.kms.getVerificationKeys(purpose)));
    }

    let lastError: unknown = new Error('No verification key available');
    for (const key of candidates) {
      try {
        return await jose.jwtVerify(token, key.secret, options);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  async generateTokenPair(
    userId: string,
    userInfo: { email: string; username: string; role: string },
    scopes: PermissionScope[],
    app: QuantApp,
    familyId?: string,
  ): Promise<TokenPair> {
    const tokenId = generateId('tok');
    const refreshTokenId = generateId('tok');
    const activeFamilyId = familyId ?? generateId('fam');
    const now = Math.floor(Date.now() / 1000);

    // Resolve the active signing keys from the KMS at sign time (Requirement
    // 2.1) and stamp each token with the key's `kid` so it can be verified under
    // the correct key after a rotation (Requirement 2.2).
    const accessKey = await this.kms.getActiveKey('access');
    const refreshKey = await this.kms.getActiveKey('refresh');

    const accessToken = await new jose.SignJWT({
      email: userInfo.email,
      username: userInfo.username,
      role: userInfo.role,
      scopes,
      app,
    })
      .setProtectedHeader({ alg: 'HS256', kid: accessKey.kid })
      .setIssuedAt()
      .setExpirationTime(`${this.config.accessTokenExpiresIn}s`)
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setJti(tokenId)
      .setSubject(userId)
      .sign(accessKey.secret);

    const refreshPayload: RefreshTokenPayload = {
      sub: userId,
      jti: refreshTokenId,
      family: activeFamilyId,
      iat: now,
      exp: now + this.config.refreshTokenExpiresIn,
    };

    const refreshToken = await new jose.SignJWT(refreshPayload as any)
      .setProtectedHeader({ alg: 'HS256', kid: refreshKey.kid })
      .setIssuedAt()
      .setExpirationTime(`${this.config.refreshTokenExpiresIn}s`)
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setJti(refreshTokenId)
      .setSubject(userId)
      .sign(refreshKey.secret);

    await this.prisma.refreshToken.create({
      data: {
        id: refreshTokenId,
        userId,
        // Persist only a one-way digest. The bearer credential itself is
        // returned to the caller once and must never be recoverable from the
        // database after an application or backup compromise.
        token: hashRefreshToken(refreshToken),
        family: activeFamilyId,
        expiresAt: new Date((now + this.config.refreshTokenExpiresIn) * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.accessTokenExpiresIn,
      tokenType: 'Bearer',
    };
  }

  async refreshToken(oldRefreshToken: string): Promise<TokenPair> {
    let payload: jose.JWTPayload;

    try {
      const verified = await this.verifyWithKms(oldRefreshToken, 'refresh', {
        issuer: this.config.issuer,
        audience: this.config.audience,
      });
      payload = verified.payload;
    } catch {
      throw new Error('Invalid refresh token');
    }

    if (
      typeof payload.jti !== 'string' ||
      typeof payload.sub !== 'string' ||
      typeof payload['family'] !== 'string'
    ) {
      throw new Error('Invalid refresh token');
    }

    const existingToken = await this.prisma.refreshToken.findUnique({
      where: { id: payload.jti },
    });

    if (!existingToken) {
      throw new Error('Refresh token reuse detected or token revoked');
    }

    const presentedDigest = hashRefreshToken(oldRefreshToken);
    const bindingIsValid =
      existingToken.token === presentedDigest &&
      existingToken.userId === payload.sub &&
      existingToken.family === payload['family'];

    if (existingToken.isRevoked || !bindingIsValid) {
      await this.prisma.refreshToken.updateMany({
        where: { family: existingToken.family },
        data: { isRevoked: true },
      });
      throw new Error('Refresh token reuse detected or token revoked');
    }

    // Compare-and-set closes the concurrent refresh race: exactly one caller
    // may rotate an active token. Every loser is treated as reuse and revokes
    // the complete family, including any descendant issued by the winner.
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { id: payload.jti, isRevoked: false },
      data: { isRevoked: true },
    });

    if (revoked.count !== 1) {
      await this.prisma.refreshToken.updateMany({
        where: { family: existingToken.family },
        data: { isRevoked: true },
      });
      throw new Error('Refresh token reuse detected or token revoked');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Use original scopes if available, otherwise default
    const scopes: PermissionScope[] = (payload['scopes'] as PermissionScope[] | undefined) || [
      'openid',
      'profile',
      'email',
    ];

    return this.generateTokenPair(
      payload.sub,
      {
        email: user.email,
        username: user.username,
        role: user.role,
      },
      scopes,
      (payload['app'] || 'quantmail') as QuantApp,
      existingToken.family,
    );
  }

  async revokeToken(tokenId: string, _reason: string = 'user_logout'): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { id: tokenId },
      data: { isRevoked: true },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });
  }

  async validateAccessToken(token: string): Promise<TokenPayload | null> {
    try {
      const { payload } = await this.verifyWithKms(token, 'access', {
        issuer: this.config.issuer,
        audience: this.config.audience,
      });
      return payload as unknown as TokenPayload;
    } catch {
      return null;
    }
  }

  async initializeJWKS(): Promise<void> {
    const { privateKey, publicKey } = await jose.generateKeyPair('RS256');
    this.jwksKeyPair = { privateKey, publicKey };
  }

  async getJWKS(): Promise<jose.JSONWebKeySet> {
    if (!this.jwksKeyPair) {
      await this.initializeJWKS();
    }
    const publicJwk = await jose.exportJWK(this.jwksKeyPair!.publicKey);
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    publicJwk.kid = 'quant-primary';
    return { keys: [publicJwk] };
  }

  async signWithPrivateKey(payload: Record<string, unknown>): Promise<string> {
    if (!this.jwksKeyPair) {
      await this.initializeJWKS();
    }
    return new jose.SignJWT(payload as jose.JWTPayload)
      .setProtectedHeader({ alg: 'RS256', kid: 'quant-primary' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .setIssuer(this.config.issuer)
      .sign(this.jwksKeyPair!.privateKey);
  }
}
