import { z } from 'zod';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

export const OAuth2ClientSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  name: z.string(),
  redirectUris: z.array(z.string()),
  scopes: z.array(z.string()),
  grantTypes: z.array(z.enum(['authorization_code', 'client_credentials', 'refresh_token'])),
});

export type OAuth2Client = z.infer<typeof OAuth2ClientSchema>;

export const TokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.literal('Bearer'),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
});

export type TokenResponse = z.infer<typeof TokenResponseSchema>;

export const IntrospectionResponseSchema = z.object({
  active: z.boolean(),
  scope: z.string().optional(),
  client_id: z.string().optional(),
  token_type: z.string().optional(),
  exp: z.number().optional(),
  iat: z.number().optional(),
  sub: z.string().optional(),
});

export type IntrospectionResponse = z.infer<typeof IntrospectionResponseSchema>;

interface AuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  userId: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  expiresAt: number;
}

interface TokenRecord {
  accessToken: string;
  refreshToken?: string;
  clientId: string;
  userId?: string;
  scopes: string[];
  issuedAt: number;
  expiresAt: number;
  revoked: boolean;
}

export interface AuthorizeRequest {
  responseType: 'code';
  clientId: string;
  redirectUri: string;
  scope: string;
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: 'S256' | 'plain';
}

export interface TokenRequest {
  grantType: 'authorization_code' | 'client_credentials' | 'refresh_token';
  clientId: string;
  clientSecret?: string;
  code?: string;
  redirectUri?: string;
  codeVerifier?: string;
  refreshToken?: string;
  scope?: string;
}

export interface OAuth2Error {
  error: string;
  error_description: string;
}

export class OAuth2Provider {
  private clients: Map<string, OAuth2Client> = new Map();
  private codes: Map<string, AuthorizationCode> = new Map();
  private tokens: Map<string, TokenRecord> = new Map();
  private refreshTokenIndex: Map<string, string> = new Map();
  private tokenExpirySeconds = 3600;

  registerClient(client: OAuth2Client): void {
    const parsed = OAuth2ClientSchema.parse(client);
    this.clients.set(parsed.clientId, parsed);
  }

  authorize(
    request: AuthorizeRequest,
    userId: string,
  ): { code: string; state?: string } | OAuth2Error {
    const client = this.clients.get(request.clientId);
    if (!client) {
      return { error: 'invalid_client', error_description: 'Client not found' };
    }

    if (!client.redirectUris.includes(request.redirectUri)) {
      return { error: 'invalid_request', error_description: 'Invalid redirect URI' };
    }

    if (!client.grantTypes.includes('authorization_code')) {
      return { error: 'unauthorized_client', error_description: 'Grant type not allowed' };
    }

    const scopes = request.scope.split(' ').filter(Boolean);
    const invalidScopes = scopes.filter((s) => !client.scopes.includes(s));
    if (invalidScopes.length > 0) {
      return {
        error: 'invalid_scope',
        error_description: `Invalid scopes: ${invalidScopes.join(', ')}`,
      };
    }

    const code = randomBytes(32).toString('hex');
    const authCode: AuthorizationCode = {
      code,
      clientId: request.clientId,
      redirectUri: request.redirectUri,
      scopes,
      userId,
      codeChallenge: request.codeChallenge,
      codeChallengeMethod: request.codeChallengeMethod,
      expiresAt: Date.now() + 600_000, // 10 minutes
    };

    this.codes.set(code, authCode);
    return { code, state: request.state };
  }

  token(request: TokenRequest): TokenResponse | OAuth2Error {
    switch (request.grantType) {
      case 'authorization_code':
        return this.handleAuthorizationCode(request);
      case 'client_credentials':
        return this.handleClientCredentials(request);
      case 'refresh_token':
        return this.handleRefreshToken(request);
      default:
        return { error: 'unsupported_grant_type', error_description: 'Unsupported grant type' };
    }
  }

  introspect(token: string): IntrospectionResponse {
    const record = this.tokens.get(token);
    if (!record || record.revoked || Date.now() > record.expiresAt) {
      return { active: false };
    }

    return {
      active: true,
      scope: record.scopes.join(' '),
      client_id: record.clientId,
      token_type: 'Bearer',
      exp: Math.floor(record.expiresAt / 1000),
      iat: Math.floor(record.issuedAt / 1000),
      sub: record.userId,
    };
  }

  revoke(token: string): boolean {
    const record = this.tokens.get(token);
    if (record) {
      record.revoked = true;
      return true;
    }

    // Check if it's a refresh token
    const accessToken = this.refreshTokenIndex.get(token);
    if (accessToken) {
      const rec = this.tokens.get(accessToken);
      if (rec) {
        rec.revoked = true;
        return true;
      }
    }

    return false;
  }

  getClient(clientId: string): OAuth2Client | null {
    return this.clients.get(clientId) ?? null;
  }

  private handleAuthorizationCode(request: TokenRequest): TokenResponse | OAuth2Error {
    if (!request.code) {
      return { error: 'invalid_request', error_description: 'Code is required' };
    }

    const authCode = this.codes.get(request.code);
    if (!authCode) {
      return { error: 'invalid_grant', error_description: 'Invalid authorization code' };
    }

    if (Date.now() > authCode.expiresAt) {
      this.codes.delete(request.code);
      return { error: 'invalid_grant', error_description: 'Authorization code expired' };
    }

    if (authCode.clientId !== request.clientId) {
      return { error: 'invalid_grant', error_description: 'Client mismatch' };
    }

    if (authCode.redirectUri !== request.redirectUri) {
      return { error: 'invalid_grant', error_description: 'Redirect URI mismatch' };
    }

    // PKCE verification
    if (authCode.codeChallenge) {
      if (!request.codeVerifier) {
        return { error: 'invalid_grant', error_description: 'Code verifier required' };
      }

      const challenge =
        authCode.codeChallengeMethod === 'S256'
          ? createHash('sha256').update(request.codeVerifier).digest('base64url')
          : request.codeVerifier;

      if (challenge !== authCode.codeChallenge) {
        return { error: 'invalid_grant', error_description: 'Code verifier mismatch' };
      }
    }

    this.codes.delete(request.code);
    return this.issueToken(authCode.clientId, authCode.scopes, authCode.userId);
  }

  private handleClientCredentials(request: TokenRequest): TokenResponse | OAuth2Error {
    const client = this.clients.get(request.clientId);
    if (!client) {
      return { error: 'invalid_client', error_description: 'Client not found' };
    }

    if (
      !request.clientSecret ||
      !this.constantTimeEquals(client.clientSecret, request.clientSecret)
    ) {
      return { error: 'invalid_client', error_description: 'Invalid client secret' };
    }

    if (!client.grantTypes.includes('client_credentials')) {
      return { error: 'unauthorized_client', error_description: 'Grant type not allowed' };
    }

    const scopes = request.scope
      ? request.scope.split(' ').filter((s) => client.scopes.includes(s))
      : client.scopes;

    return this.issueToken(request.clientId, scopes);
  }

  private handleRefreshToken(request: TokenRequest): TokenResponse | OAuth2Error {
    if (!request.refreshToken) {
      return { error: 'invalid_request', error_description: 'Refresh token required' };
    }

    const accessToken = this.refreshTokenIndex.get(request.refreshToken);
    if (!accessToken) {
      return { error: 'invalid_grant', error_description: 'Invalid refresh token' };
    }

    const record = this.tokens.get(accessToken);
    if (!record || record.revoked) {
      return { error: 'invalid_grant', error_description: 'Token has been revoked' };
    }

    if (record.clientId !== request.clientId) {
      return { error: 'invalid_grant', error_description: 'Client mismatch' };
    }

    // Revoke old token
    record.revoked = true;

    return this.issueToken(record.clientId, record.scopes, record.userId);
  }

  private issueToken(clientId: string, scopes: string[], userId?: string): TokenResponse {
    const accessToken = randomBytes(32).toString('hex');
    const refreshToken = randomBytes(32).toString('hex');
    const now = Date.now();

    const record: TokenRecord = {
      accessToken,
      refreshToken,
      clientId,
      userId,
      scopes,
      issuedAt: now,
      expiresAt: now + this.tokenExpirySeconds * 1000,
      revoked: false,
    };

    this.tokens.set(accessToken, record);
    this.refreshTokenIndex.set(refreshToken, accessToken);

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: this.tokenExpirySeconds,
      refresh_token: refreshToken,
      scope: scopes.join(' '),
    };
  }

  /** Constant-time string comparison to prevent timing attacks */
  private constantTimeEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      // Compare against self to maintain constant time even on length mismatch
      timingSafeEqual(bufA, bufA);
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
