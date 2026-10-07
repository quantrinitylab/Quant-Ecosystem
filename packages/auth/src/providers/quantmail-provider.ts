// ============================================================================
// Auth - QuantMail OAuth2 Provider
// Central identity provider for the entire Quant Ecosystem
// ============================================================================

import type {
  OAuthClient,
  AuthorizationRequest,
  AuthorizationCode,
  TokenExchangeRequest,
  TokenPair,
  AuthConfig,
} from '../types';
import type { PermissionScope } from '@quant/common';
import { TokenService } from '../services/token-service';
import { generateSecureToken } from '../crypto/secure-random';
import { validateCodeChallenge } from '../crypto/pkce';

/** Default OAuth scopes for first-party apps */
const FIRST_PARTY_DEFAULT_SCOPES: PermissionScope[] = [
  'profile:read',
  'profile:write',
  'email:read',
  'messages:read',
  'messages:write',
  'realtime:connect',
];

/** Safe scopes allowed for third-party client registrations */
const THIRD_PARTY_ALLOWED_SCOPES: PermissionScope[] = [
  'profile:read',
  'profile:write',
  'email:read',
  'messages:read',
  'posts:read',
  'media:read',
  'contacts:read',
  'analytics:read',
  'wallet:read',
  'realtime:connect',
];

/**
 * QuantMail OAuth2 Provider
 *
 * Implements the OAuth2 Authorization Code flow with PKCE support.
 * QuantMail serves as the central identity provider for all 13 apps
 * in the Quant Ecosystem, providing SSO across the platform.
 */
export class QuantMailProvider {
  private clients: Map<string, OAuthClient> = new Map();
  private authorizationCodes: Map<string, AuthorizationCode> = new Map();
  private thirdPartyOwners: Map<string, string[]> = new Map();
  private tokenService: TokenService;

  constructor(config: AuthConfig) {
    this.tokenService = new TokenService(config);
    this.registerEcosystemClients();
  }

  /**
   * Register all first-party Quant Ecosystem apps as OAuth clients
   */
  private registerEcosystemClients(): void {
    const ecosystemApps: OAuthClient[] = [
      {
        clientId: 'quantchat-client',
        clientSecret: this.generateClientSecret(),
        name: 'QuantChat',
        description: 'Instant messaging application',
        redirectUris: ['https://chat.quant.app/auth/callback', 'quantchat://auth/callback'],
        allowedScopes: [
          ...FIRST_PARTY_DEFAULT_SCOPES,
          'contacts:read',
          'contacts:write',
          'media:upload',
        ],
        grantTypes: ['authorization_code', 'refresh_token'],
        isFirstParty: true,
        app: 'quantchat',
      },
      {
        clientId: 'quantmail-client',
        clientSecret: this.generateClientSecret(),
        name: 'QuantMail',
        description: 'Email and identity provider',
        redirectUris: ['https://mail.quant.app/auth/callback', 'quantmail://auth/callback'],
        allowedScopes: [...FIRST_PARTY_DEFAULT_SCOPES, 'email:send'],
        grantTypes: ['authorization_code', 'refresh_token'],
        isFirstParty: true,
        app: 'quantmail',
      },
      {
        clientId: 'quantsync-client',
        clientSecret: this.generateClientSecret(),
        name: 'QuantSync',
        description: 'Social feed platform',
        redirectUris: ['https://sync.quant.app/auth/callback', 'quantsync://auth/callback'],
        allowedScopes: [...FIRST_PARTY_DEFAULT_SCOPES, 'posts:read', 'posts:write', 'media:upload'],
        grantTypes: ['authorization_code', 'refresh_token'],
        isFirstParty: true,
        app: 'quantsync',
      },
      {
        clientId: 'quantads-client',
        clientSecret: this.generateClientSecret(),
        name: 'QuantAds',
        description: 'Advertising platform',
        redirectUris: ['https://ads.quant.app/auth/callback'],
        allowedScopes: [...FIRST_PARTY_DEFAULT_SCOPES, 'ads:manage', 'analytics:read'],
        grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
        isFirstParty: true,
        app: 'quantads',
      },
      {
        clientId: 'quantube-client',
        clientSecret: this.generateClientSecret(),
        name: 'QuantTube',
        description: 'Video and music streaming',
        redirectUris: ['https://tube.quant.app/auth/callback', 'quantube://auth/callback'],
        allowedScopes: [...FIRST_PARTY_DEFAULT_SCOPES, 'media:read', 'media:upload'],
        grantTypes: ['authorization_code', 'refresh_token'],
        isFirstParty: true,
        app: 'quantube',
      },
      {
        clientId: 'quantneon-client',
        clientSecret: this.generateClientSecret(),
        name: 'QuantNeon',
        description: 'Photo and video sharing',
        redirectUris: ['https://neon.quant.app/auth/callback', 'quantneon://auth/callback'],
        allowedScopes: [
          ...FIRST_PARTY_DEFAULT_SCOPES,
          'media:read',
          'media:upload',
          'contacts:read',
        ],
        grantTypes: ['authorization_code', 'refresh_token'],
        isFirstParty: true,
        app: 'quantneon',
      },
      {
        clientId: 'quantedits-client',
        clientSecret: this.generateClientSecret(),
        name: 'QuantEdits',
        description: 'Video and photo editor',
        redirectUris: ['https://edits.quant.app/auth/callback', 'quantedits://auth/callback'],
        allowedScopes: [...FIRST_PARTY_DEFAULT_SCOPES, 'media:read', 'media:upload'],
        grantTypes: ['authorization_code', 'refresh_token'],
        isFirstParty: true,
        app: 'quantedits',
      },
      {
        clientId: 'quantmax-client',
        clientSecret: this.generateClientSecret(),
        name: 'QuantMax',
        description: 'Short video, live chat, and dating',
        redirectUris: ['https://max.quant.app/auth/callback', 'quantmax://auth/callback'],
        allowedScopes: [...FIRST_PARTY_DEFAULT_SCOPES, 'media:upload', 'contacts:read'],
        grantTypes: ['authorization_code', 'refresh_token'],
        isFirstParty: true,
        app: 'quantmax',
      },
      {
        clientId: 'quantai-client',
        clientSecret: this.generateClientSecret(),
        name: 'QuantAI',
        description: 'AI assistant hub',
        redirectUris: ['https://ai.quant.app/auth/callback', 'quantai://auth/callback'],
        allowedScopes: [...FIRST_PARTY_DEFAULT_SCOPES, 'ai:use'],
        grantTypes: ['authorization_code', 'refresh_token'],
        isFirstParty: true,
        app: 'quantai',
      },
      {
        clientId: 'quantdocs-client',
        clientSecret: this.generateClientSecret(),
        name: 'QuantDocs',
        description: 'Collaborative document editing',
        redirectUris: ['https://docs.quant.app/auth/callback', 'quantdocs://auth/callback'],
        allowedScopes: [...FIRST_PARTY_DEFAULT_SCOPES, 'workspace:read', 'workspace:manage'],
        grantTypes: ['authorization_code', 'refresh_token'],
        isFirstParty: true,
        app: 'quantdocs',
      },
      {
        clientId: 'quantdrive-client',
        clientSecret: this.generateClientSecret(),
        name: 'QuantDrive',
        description: 'Cloud storage and file management',
        redirectUris: ['https://drive.quant.app/auth/callback', 'quantdrive://auth/callback'],
        allowedScopes: [...FIRST_PARTY_DEFAULT_SCOPES, 'media:read', 'media:upload'],
        grantTypes: ['authorization_code', 'refresh_token'],
        isFirstParty: true,
        app: 'quantdrive',
      },
      {
        clientId: 'quantcalendar-client',
        clientSecret: this.generateClientSecret(),
        name: 'QuantCalendar',
        description: 'Calendar and scheduling',
        redirectUris: ['https://calendar.quant.app/auth/callback', 'quantcalendar://auth/callback'],
        allowedScopes: [...FIRST_PARTY_DEFAULT_SCOPES, 'contacts:read'],
        grantTypes: ['authorization_code', 'refresh_token'],
        isFirstParty: true,
        app: 'quantcalendar',
      },
      {
        clientId: 'quantmeet-client',
        clientSecret: this.generateClientSecret(),
        name: 'QuantMeet',
        description: 'Video conferencing and meetings',
        redirectUris: ['https://meet.quant.app/auth/callback', 'quantmeet://auth/callback'],
        allowedScopes: [...FIRST_PARTY_DEFAULT_SCOPES, 'contacts:read', 'media:upload'],
        grantTypes: ['authorization_code', 'refresh_token'],
        isFirstParty: true,
        app: 'quantmeet',
      },
    ];

    for (const client of ecosystemApps) {
      this.clients.set(client.clientId, client);
    }
  }

  /**
   * Initiate the authorization flow - validate the request and return auth page data
   */
  authorize(request: AuthorizationRequest): {
    success: boolean;
    error?: string;
    client?: OAuthClient;
    requestedScopes?: PermissionScope[];
  } {
    // Validate client
    const client = this.clients.get(request.clientId);
    if (!client) {
      return { success: false, error: 'Invalid client_id' };
    }

    // Validate redirect URI
    if (!client.redirectUris.includes(request.redirectUri)) {
      return { success: false, error: 'Invalid redirect_uri' };
    }

    // Validate response type
    if (request.responseType !== 'code') {
      return { success: false, error: 'Unsupported response_type. Only "code" is supported.' };
    }

    // Validate and filter scopes
    const requestedScopes = request.scope.split(' ').filter(Boolean) as PermissionScope[];
    const invalidScopes = requestedScopes.filter((s) => !client.allowedScopes.includes(s));
    if (invalidScopes.length > 0) {
      return { success: false, error: `Invalid scopes: ${invalidScopes.join(', ')}` };
    }

    // Validate PKCE for public clients
    if (
      request.codeChallenge &&
      request.codeChallengeMethod !== 'S256' &&
      request.codeChallengeMethod !== 'plain'
    ) {
      return { success: false, error: 'Invalid code_challenge_method' };
    }

    return { success: true, client, requestedScopes };
  }

  /**
   * Generate an authorization code after user consent
   */
  generateAuthorizationCode(
    userId: string,
    request: AuthorizationRequest,
  ): { code: string; redirectUrl: string } {
    const code = generateSecureToken(32);
    const authCode: AuthorizationCode = {
      code,
      clientId: request.clientId,
      userId,
      redirectUri: request.redirectUri,
      scope: request.scope,
      codeChallenge: request.codeChallenge,
      codeChallengeMethod: request.codeChallengeMethod,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      nonce: request.nonce,
    };

    this.authorizationCodes.set(code, authCode);

    // Build redirect URL with code and state
    const redirectUrl = new URL(request.redirectUri);
    redirectUrl.searchParams.set('code', code);
    redirectUrl.searchParams.set('state', request.state);

    return { code, redirectUrl: redirectUrl.toString() };
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(request: TokenExchangeRequest): Promise<{
    success: boolean;
    tokens?: TokenPair;
    error?: string;
  }> {
    if (request.grantType === 'refresh_token') {
      return this.handleRefreshToken(request);
    }

    if (request.grantType !== 'authorization_code' || !request.code) {
      return { success: false, error: 'Invalid grant_type or missing code' };
    }

    // Find and validate the authorization code
    const authCode = this.authorizationCodes.get(request.code);
    if (!authCode) {
      return { success: false, error: 'Invalid authorization code' };
    }

    // Check expiration
    if (authCode.expiresAt < new Date()) {
      this.authorizationCodes.delete(request.code);
      return { success: false, error: 'Authorization code expired' };
    }

    // Validate client
    if (authCode.clientId !== request.clientId) {
      return { success: false, error: 'Client ID mismatch' };
    }

    // Validate redirect URI
    if (authCode.redirectUri !== request.redirectUri) {
      return { success: false, error: 'Redirect URI mismatch' };
    }

    // Validate PKCE code verifier
    if (authCode.codeChallenge) {
      if (!request.codeVerifier) {
        return { success: false, error: 'Code verifier required' };
      }
      const method = (authCode.codeChallengeMethod || 'plain') as 'plain' | 'S256';
      const valid = await validateCodeChallenge(
        request.codeVerifier,
        authCode.codeChallenge,
        method,
      );
      if (!valid) {
        return { success: false, error: 'Invalid code verifier' };
      }
    }

    // Consume the code (one-time use)
    this.authorizationCodes.delete(request.code);

    // Get the client
    const client = this.clients.get(request.clientId);
    if (!client) {
      return { success: false, error: 'Client not found' };
    }

    // Generate tokens
    const scopes = authCode.scope.split(' ').filter(Boolean) as PermissionScope[];
    const tokens = await this.tokenService.generateTokenPair(
      authCode.userId,
      { email: '', username: '', role: 'user' }, // In production, fetch from user store
      scopes,
      client.app,
    );

    return { success: true, tokens };
  }

  /**
   * Handle refresh token grant
   */
  private async handleRefreshToken(request: TokenExchangeRequest): Promise<{
    success: boolean;
    tokens?: TokenPair;
    error?: string;
  }> {
    if (!request.refreshToken) {
      return { success: false, error: 'Missing refresh_token' };
    }

    try {
      const result = await this.tokenService.refreshToken(request.refreshToken);
      return { success: true, tokens: result };
    } catch (err: any) {
      return { success: false, error: err.message || 'Invalid or expired refresh token' };
    }
  }

  /**
   * Register a new OAuth client (third-party)
   */
  registerClient(client: OAuthClient): void {
    this.clients.set(client.clientId, client);
  }

  /**
   * Register a third-party client for federated identity (Sign in with Quant)
   */
  registerThirdPartyClient(
    name: string,
    redirectUris: string[],
    allowedScopes: PermissionScope[],
    createdBy: string,
  ): OAuthClient {
    // Validate scopes against safe subset for third-party apps
    const invalidScopes = allowedScopes.filter((s) => !THIRD_PARTY_ALLOWED_SCOPES.includes(s));
    if (invalidScopes.length > 0) {
      throw new Error(
        `Invalid scopes for third-party client: ${invalidScopes.join(', ')}. Allowed: ${THIRD_PARTY_ALLOWED_SCOPES.join(', ')}`,
      );
    }

    const clientId = `tp_${generateSecureToken(16)}`;
    const clientSecret = this.generateClientSecret();
    const client: OAuthClient = {
      clientId,
      clientSecret,
      name,
      description: `Third-party app: ${name}`,
      redirectUris,
      allowedScopes,
      grantTypes: ['authorization_code', 'refresh_token'],
      isFirstParty: false,
      app: 'quantmail',
    };
    this.clients.set(clientId, client);
    // Track ownership
    if (!this.thirdPartyOwners.has(createdBy)) {
      this.thirdPartyOwners.set(createdBy, []);
    }
    this.thirdPartyOwners.get(createdBy)!.push(clientId);
    return client;
  }

  /**
   * List third-party clients owned by a user
   */
  listThirdPartyClients(userId: string): OAuthClient[] {
    const clientIds = this.thirdPartyOwners.get(userId) ?? [];
    return clientIds
      .map((id) => this.clients.get(id))
      .filter((c): c is OAuthClient => c !== undefined);
  }

  /**
   * Revoke a third-party client
   */
  revokeThirdPartyClient(clientId: string): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.isFirstParty) return false;
    this.clients.delete(clientId);
    // Remove from owner tracking
    for (const [userId, ids] of this.thirdPartyOwners) {
      const index = ids.indexOf(clientId);
      if (index !== -1) {
        ids.splice(index, 1);
        if (ids.length === 0) {
          this.thirdPartyOwners.delete(userId);
        }
        break;
      }
    }
    return true;
  }

  /**
   * Get a registered client by ID
   */
  getClient(clientId: string): OAuthClient | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Revoke all tokens for a user (logout from all apps)
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.tokenService.revokeAllForUser(userId);
  }

  /**
   * Generate a cryptographically secure client secret
   */
  private generateClientSecret(): string {
    return `qcs_${generateSecureToken(24)}`;
  }
}
