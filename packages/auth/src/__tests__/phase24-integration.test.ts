import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuantMailProvider } from '../providers/quantmail-provider';
import { SessionService } from '../services/session-service';
import { WebAuthnService } from '../services/webauthn-service';
import type { AuthConfig, AuthorizationRequest, DeviceLoginInfo } from '../types';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import type { QuantApp } from '@quant/common';

// Mock @simplewebauthn/server
vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn().mockResolvedValue({
    challenge: 'mock-challenge-registration',
    rp: { name: 'Quant', id: 'quant.app' },
    user: { id: 'user-1', name: 'testuser', displayName: 'Test User' },
    pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
    timeout: 60000,
    attestation: 'none',
  }),
  verifyRegistrationResponse: vi.fn().mockResolvedValue({
    verified: true,
    registrationInfo: {
      credential: {
        id: 'passkey-cred-001',
        publicKey: new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]),
        counter: 0,
      },
    },
  }),
  generateAuthenticationOptions: vi.fn().mockResolvedValue({
    challenge: 'mock-challenge-authentication',
    rpId: 'quant.app',
    timeout: 60000,
    userVerification: 'preferred',
    allowCredentials: [],
  }),
  verifyAuthenticationResponse: vi.fn().mockResolvedValue({
    verified: true,
    authenticationInfo: {
      newCounter: 1,
    },
  }),
}));

const TEST_AUTH_CONFIG: AuthConfig = {
  jwtSecret: 'test-jwt-secret-phase24-integration-key-minimum-length',
  jwtRefreshSecret: 'test-jwt-refresh-secret-phase24-integration-key-minimum',
  accessTokenExpiresIn: 900,
  refreshTokenExpiresIn: 604800,
  issuer: 'https://auth.quant.app',
  audience: 'https://quant.app',
  bcryptRounds: 4,
  maxLoginAttempts: 5,
  lockoutDuration: 300,
};

/** All 13 first-party app client IDs */
const ALL_APP_CLIENT_IDS: { clientId: string; app: QuantApp; redirectUri: string }[] = [
  {
    clientId: 'quantchat-client',
    app: 'quantchat',
    redirectUri: 'https://chat.quant.app/auth/callback',
  },
  {
    clientId: 'quantmail-client',
    app: 'quantmail',
    redirectUri: 'https://mail.quant.app/auth/callback',
  },
  {
    clientId: 'quantsync-client',
    app: 'quantsync',
    redirectUri: 'https://sync.quant.app/auth/callback',
  },
  {
    clientId: 'quantads-client',
    app: 'quantads',
    redirectUri: 'https://ads.quant.app/auth/callback',
  },
  {
    clientId: 'quantube-client',
    app: 'quantube',
    redirectUri: 'https://tube.quant.app/auth/callback',
  },
  {
    clientId: 'quantneon-client',
    app: 'quantneon',
    redirectUri: 'https://neon.quant.app/auth/callback',
  },
  {
    clientId: 'quantedits-client',
    app: 'quantedits',
    redirectUri: 'https://edits.quant.app/auth/callback',
  },
  {
    clientId: 'quantmax-client',
    app: 'quantmax',
    redirectUri: 'https://max.quant.app/auth/callback',
  },
  {
    clientId: 'quantai-client',
    app: 'quantai',
    redirectUri: 'https://ai.quant.app/auth/callback',
  },
  {
    clientId: 'quantdocs-client',
    app: 'quantdocs',
    redirectUri: 'https://docs.quant.app/auth/callback',
  },
  {
    clientId: 'quantdrive-client',
    app: 'quantdrive',
    redirectUri: 'https://drive.quant.app/auth/callback',
  },
  {
    clientId: 'quantcalendar-client',
    app: 'quantcalendar',
    redirectUri: 'https://calendar.quant.app/auth/callback',
  },
  {
    clientId: 'quantmeet-client',
    app: 'quantmeet',
    redirectUri: 'https://meet.quant.app/auth/callback',
  },
];

function makeDeviceInfo(overrides?: Partial<DeviceLoginInfo>): DeviceLoginInfo {
  return {
    deviceId: 'device-001',
    platform: 'web',
    userAgent: 'Mozilla/5.0 Phase24 Integration Test',
    ipAddress: '192.168.1.1',
    ...overrides,
  };
}

function makeRegResponse(): RegistrationResponseJSON {
  return {
    id: 'passkey-cred-001',
    rawId: 'passkey-cred-001',
    type: 'public-key',
    response: {
      clientDataJSON: 'mock-client-data',
      attestationObject: 'mock-attestation',
      transports: ['internal'] as AuthenticatorTransportFuture[],
    },
    clientExtensionResults: {},
    authenticatorAttachment: 'platform',
  };
}

function makeAuthResponse(): AuthenticationResponseJSON {
  return {
    id: 'passkey-cred-001',
    rawId: 'passkey-cred-001',
    type: 'public-key',
    response: {
      clientDataJSON: 'mock-client-data',
      authenticatorData: 'mock-auth-data',
      signature: 'mock-signature',
    },
    clientExtensionResults: {},
    authenticatorAttachment: 'platform',
  };
}

describe('Phase 24 Integration: One Identity Across All Apps', () => {
  let provider: QuantMailProvider;
  let sessionService: SessionService;
  let webauthnService: WebAuthnService;
  const userId = 'user-phase24-integration';

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new QuantMailProvider(TEST_AUTH_CONFIG);
    sessionService = new SessionService(TEST_AUTH_CONFIG);
    webauthnService = new WebAuthnService('Quant', 'quant.app');
  });

  describe('single identity across all 13 apps', () => {
    it('should generate authorization codes for the same user across all 13 apps', () => {
      for (const { clientId, redirectUri } of ALL_APP_CLIENT_IDS) {
        const request: AuthorizationRequest = {
          clientId,
          redirectUri,
          responseType: 'code',
          scope: 'profile:read',
          state: `state-${clientId}`,
        };

        const authResult = provider.authorize(request);
        expect(authResult.success).toBe(true);

        const { code, redirectUrl } = provider.generateAuthorizationCode(userId, request);
        expect(code).toBeDefined();
        expect(code.length).toBeGreaterThan(0);
        expect(redirectUrl).toContain(redirectUri);
        expect(redirectUrl).toContain('code=');
        expect(redirectUrl).toContain(`state=state-${clientId}`);
      }
    });

    it('should exchange codes for tokens proving one identity works across all 13 apps', async () => {
      const tokens: { clientId: string; accessToken: string }[] = [];

      for (const { clientId, redirectUri } of ALL_APP_CLIENT_IDS) {
        const request: AuthorizationRequest = {
          clientId,
          redirectUri,
          responseType: 'code',
          scope: 'profile:read',
          state: `state-${clientId}`,
        };

        const { code } = provider.generateAuthorizationCode(userId, request);

        const result = await provider.exchangeCode({
          grantType: 'authorization_code',
          code,
          redirectUri,
          clientId,
        });

        expect(result.success).toBe(true);
        expect(result.tokens).toBeDefined();
        expect(result.tokens!.accessToken).toBeDefined();
        expect(result.tokens!.tokenType).toBe('Bearer');

        tokens.push({ clientId, accessToken: result.tokens!.accessToken });
      }

      // All 13 apps got tokens for the same userId
      expect(tokens).toHaveLength(13);
    });

    it('should track sessions correctly across multiple apps', async () => {
      const apps: QuantApp[] = ['quantchat', 'quantmail', 'quantsync', 'quantai', 'quantdocs'];

      for (const app of apps) {
        await sessionService.createSession({
          userId,
          tokenId: `tok-${app}`,
          refreshTokenFamily: `fam-${app}`,
          deviceInfo: makeDeviceInfo(),
          app,
        });
      }

      const sessions = await sessionService.getUserSessions(userId);
      expect(sessions).toHaveLength(5);

      // Verify cross-app session awareness
      for (const app of apps) {
        const hasSession = await sessionService.hasActiveSessionForApp(userId, app);
        expect(hasSession).toBe(true);
      }

      // Verify session grouping by app
      const grouped = await sessionService.getSessionsByApp(userId);
      expect(grouped.size).toBe(5);
    });

    it('should not require re-auth when moving between apps (session validation)', async () => {
      // Create a session for one app
      const session = await sessionService.createSession({
        userId,
        tokenId: 'tok-main',
        refreshTokenFamily: 'fam-main',
        deviceInfo: makeDeviceInfo(),
        app: 'quantmail',
      });

      // Verify the session is valid (simulate checking from another app)
      const retrieved = await sessionService.getSession(session.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.isActive).toBe(true);
      expect(retrieved!.userId).toBe(userId);

      // The same user can immediately access other apps since the session proves identity
      // No re-authentication needed - just create sessions for the other apps
      await sessionService.createSession({
        userId,
        tokenId: 'tok-chat',
        refreshTokenFamily: 'fam-chat',
        deviceInfo: makeDeviceInfo(),
        app: 'quantchat',
      });

      await sessionService.createSession({
        userId,
        tokenId: 'tok-ai',
        refreshTokenFamily: 'fam-ai',
        deviceInfo: makeDeviceInfo(),
        app: 'quantai',
      });

      // All sessions belong to the same user
      const allSessions = await sessionService.getUserSessions(userId);
      expect(allSessions.every((s) => s.userId === userId)).toBe(true);
      expect(allSessions.every((s) => s.isActive)).toBe(true);
    });
  });

  describe('passkey enrollment end-to-end', () => {
    it('should complete full passkey registration flow', async () => {
      // Step 1: Generate registration options
      const regOpts = await webauthnService.generateRegistrationOpts(userId, 'testuser');
      expect(regOpts.options).toBeDefined();
      expect(regOpts.options.challenge).toBe('mock-challenge-registration');

      // Step 2: Simulate authenticator response and verify
      const regResult = await webauthnService.verifyRegistration(
        userId,
        makeRegResponse(),
        'https://quant.app',
      );

      expect(regResult.verified).toBe(true);
      expect(regResult.credential).toBeDefined();
      expect(regResult.credential!.credentialId).toBe('passkey-cred-001');
      expect(regResult.credential!.counter).toBe(0);

      // Step 3: Verify credential is stored
      const credentials = webauthnService.listCredentials(userId);
      expect(credentials).toHaveLength(1);
      expect(credentials[0]!.credentialId).toBe('passkey-cred-001');
    });

    it('should complete full passkey authentication flow after enrollment', async () => {
      // First, enroll
      await webauthnService.generateRegistrationOpts(userId, 'testuser');
      const regResult = await webauthnService.verifyRegistration(
        userId,
        makeRegResponse(),
        'https://quant.app',
      );
      const credential = regResult.credential!;

      // Step 1: Generate authentication options
      const authOpts = await webauthnService.generateAuthenticationOpts(userId, [credential]);
      expect(authOpts.options).toBeDefined();
      expect(authOpts.options.challenge).toBe('mock-challenge-authentication');

      // Step 2: Simulate authenticator response and verify
      const authResult = await webauthnService.verifyAuthentication(
        userId,
        makeAuthResponse(),
        'https://quant.app',
        credential,
      );

      expect(authResult.verified).toBe(true);
      expect(authResult.newCounter).toBe(1);
    });

    it('should fail verification with invalid challenge (no prior generateRegistrationOpts)', async () => {
      // Attempt to verify without generating options first (no challenge stored)
      const result = await webauthnService.verifyRegistration(
        'user-no-challenge',
        makeRegResponse(),
        'https://quant.app',
      );

      expect(result.verified).toBe(false);
    });

    it('should fail authentication when no challenge is stored', async () => {
      // Enroll first
      await webauthnService.generateRegistrationOpts(userId, 'testuser');
      const regResult = await webauthnService.verifyRegistration(
        userId,
        makeRegResponse(),
        'https://quant.app',
      );
      const credential = regResult.credential!;

      // Try to authenticate without generating auth options (challenge consumed)
      const authResult = await webauthnService.verifyAuthentication(
        userId,
        makeAuthResponse(),
        'https://quant.app',
        credential,
      );

      expect(authResult.verified).toBe(false);
    });
  });

  describe('cross-app SSO with token exchange', () => {
    it('should issue tokens for the same user across all apps without re-auth', async () => {
      // User authenticates once via QuantMail
      const mailRequest: AuthorizationRequest = {
        clientId: 'quantmail-client',
        redirectUri: 'https://mail.quant.app/auth/callback',
        responseType: 'code',
        scope: 'profile:read email:read',
        state: 'initial-state',
      };

      const { code: mailCode } = provider.generateAuthorizationCode(userId, mailRequest);
      const mailResult = await provider.exchangeCode({
        grantType: 'authorization_code',
        code: mailCode,
        redirectUri: 'https://mail.quant.app/auth/callback',
        clientId: 'quantmail-client',
      });

      expect(mailResult.success).toBe(true);

      // Now the user visits QuantChat - no re-auth needed, just get a new token
      const chatRequest: AuthorizationRequest = {
        clientId: 'quantchat-client',
        redirectUri: 'https://chat.quant.app/auth/callback',
        responseType: 'code',
        scope: 'profile:read messages:read',
        state: 'chat-state',
      };

      const { code: chatCode } = provider.generateAuthorizationCode(userId, chatRequest);
      const chatResult = await provider.exchangeCode({
        grantType: 'authorization_code',
        code: chatCode,
        redirectUri: 'https://chat.quant.app/auth/callback',
        clientId: 'quantchat-client',
      });

      expect(chatResult.success).toBe(true);
      expect(chatResult.tokens!.accessToken).not.toBe(mailResult.tokens!.accessToken);
      // Both tokens are for the same user - different apps
    });
  });
});
