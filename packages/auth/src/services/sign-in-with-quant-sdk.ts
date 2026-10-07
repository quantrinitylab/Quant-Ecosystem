// ============================================================================
// Auth - Sign-in-with-Quant SDK
// ============================================================================

import * as jose from 'jose';
import type { AuthConfig, OAuthClient } from '../types';
import type { PermissionScope } from '@quant/common';
import { generateCodeVerifier, generateCodeChallenge } from '../crypto/pkce';
import { generateSecureToken, generateId } from '../crypto/secure-random';

/** User profile returned by the SDK */
export interface QuantUserProfile {
  id: string;
  email: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  role: string;
}

/** Authorization URL result with PKCE parameters */
export interface AuthUrlResult {
  url: string;
  codeVerifier: string;
  state: string;
}

/** Token response from callback handling */
export interface SDKTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  scope: string[];
}

/**
 * Sign-in-with-Quant SDK
 *
 * Developer-facing SDK for external websites and applications to integrate
 * "Sign in with Quant" authentication. Implements OAuth2 with PKCE for
 * secure authorization code flow.
 */
export class SignInWithQuantSDK {
  private config: AuthConfig;
  private secret: Uint8Array;
  private authorizationEndpoint: string;
  // In-memory store for registered clients (maps clientId -> client record)
  private registeredClients: Map<string, OAuthClient> = new Map();
  // In-memory store for authorization codes (maps code -> metadata)
  private authCodes: Map<
    string,
    {
      clientId: string;
      redirectUri: string;
      scopes: PermissionScope[];
      codeChallenge: string;
      userId: string;
      expiresAt: Date;
    }
  > = new Map();

  constructor(config: AuthConfig) {
    this.config = config;
    this.secret = new TextEncoder().encode(config.jwtSecret);
    this.authorizationEndpoint = `https://auth.quant.app/oauth2/authorize`;
  }

  /**
   * Register a client with the SDK for secret validation.
   */
  registerClient(client: OAuthClient): void {
    this.registeredClients.set(client.clientId, client);
  }

  /**
   * Generate an OAuth2 authorization URL with PKCE parameters.
   * External apps call this to initiate the sign-in flow.
   */
  async generateAuthUrl(
    clientId: string,
    redirectUri: string,
    scopes: PermissionScope[],
    state?: string,
  ): Promise<AuthUrlResult> {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const resolvedState = state || generateSecureToken(16);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      state: resolvedState,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const url = `${this.authorizationEndpoint}?${params.toString()}`;

    return {
      url,
      codeVerifier,
      state: resolvedState,
    };
  }

  /**
   * Handle the OAuth2 callback by exchanging an authorization code for tokens.
   * Validates the code, client credentials, and PKCE verifier.
   */
  async handleCallback(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string,
    codeVerifier: string,
  ): Promise<SDKTokenResponse | null> {
    // Look up the authorization code
    const authCode = this.authCodes.get(code);
    if (!authCode) {
      return null;
    }

    // Validate expiration
    if (authCode.expiresAt < new Date()) {
      this.authCodes.delete(code);
      return null;
    }

    // Validate client ID and redirect URI
    if (authCode.clientId !== clientId || authCode.redirectUri !== redirectUri) {
      return null;
    }

    // Validate clientSecret against registered client (confidential client flow)
    const registeredClient = this.registeredClients.get(clientId);
    if (registeredClient) {
      if (registeredClient.clientSecret !== clientSecret) {
        return null;
      }
    }

    // Validate PKCE code verifier against stored challenge
    const computedChallenge = await generateCodeChallenge(codeVerifier);
    if (computedChallenge !== authCode.codeChallenge) {
      return null;
    }

    // Remove the used code (one-time use)
    this.authCodes.delete(code);

    // Generate tokens for the authenticated user
    const tokenId = generateId('tok');

    const accessToken = await new jose.SignJWT({
      scopes: authCode.scopes,
      client_id: clientId,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${this.config.accessTokenExpiresIn}s`)
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setJti(tokenId)
      .setSubject(authCode.userId)
      .sign(this.secret);

    const refreshTokenId = generateId('tok');
    const refreshToken = await new jose.SignJWT({
      client_id: clientId,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${this.config.refreshTokenExpiresIn}s`)
      .setJti(refreshTokenId)
      .setSubject(authCode.userId)
      .sign(this.secret);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.accessTokenExpiresIn,
      tokenType: 'Bearer',
      scope: authCode.scopes,
    };
  }

  /**
   * Get basic user profile information from an access token's claims.
   */
  async getUserProfile(accessToken: string): Promise<QuantUserProfile | null> {
    try {
      const { payload } = await jose.jwtVerify(accessToken, this.secret, {
        issuer: this.config.issuer,
        audience: this.config.audience,
      });

      if (!payload.sub) return null;

      return {
        id: payload.sub,
        email: (payload['email'] as string) || '',
        username: (payload['username'] as string) || '',
        displayName: (payload['displayName'] as string) || undefined,
        avatarUrl: (payload['avatarUrl'] as string) || undefined,
        role: (payload['role'] as string) || 'user',
      };
    } catch {
      return null;
    }
  }

  /**
   * Refresh an access token using a refresh token.
   */
  async refreshToken(
    refreshTokenStr: string,
    clientId: string,
    clientSecret: string,
  ): Promise<SDKTokenResponse | null> {
    // Validate clientSecret against registered client (confidential client flow)
    const registeredClient = this.registeredClients.get(clientId);
    if (registeredClient) {
      if (registeredClient.clientSecret !== clientSecret) {
        return null;
      }
    }

    try {
      const { payload } = await jose.jwtVerify(refreshTokenStr, this.secret);

      if (!payload.sub || !payload.jti) return null;

      // Validate client_id matches
      const tokenClientId = payload['client_id'] as string | undefined;
      if (tokenClientId && tokenClientId !== clientId) {
        return null;
      }

      // Generate new access token
      const newTokenId = generateId('tok');
      const accessToken = await new jose.SignJWT({
        scopes: (payload['scopes'] as PermissionScope[]) || ['profile:read'],
        client_id: clientId,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${this.config.accessTokenExpiresIn}s`)
        .setIssuer(this.config.issuer)
        .setAudience(this.config.audience)
        .setJti(newTokenId)
        .setSubject(payload.sub)
        .sign(this.secret);

      // Generate new refresh token
      const newRefreshTokenId = generateId('tok');
      const newRefreshToken = await new jose.SignJWT({
        client_id: clientId,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${this.config.refreshTokenExpiresIn}s`)
        .setJti(newRefreshTokenId)
        .setSubject(payload.sub)
        .sign(this.secret);

      return {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn: this.config.accessTokenExpiresIn,
        tokenType: 'Bearer',
        scope: (payload['scopes'] as string[]) || ['profile:read'],
      };
    } catch {
      return null;
    }
  }

  /**
   * Create an authorization code (called by Quant auth server after user consent).
   * This is an internal method used during the authorization flow.
   */
  createAuthorizationCode(
    clientId: string,
    redirectUri: string,
    scopes: PermissionScope[],
    codeChallenge: string,
    userId: string,
  ): string {
    const code = generateSecureToken(32);

    this.authCodes.set(code, {
      clientId,
      redirectUri,
      scopes,
      codeChallenge,
      userId,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minute expiry
    });

    return code;
  }
}
