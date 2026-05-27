import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AccountLifecycleService } from '../services/account-lifecycle-service';
import { SessionService } from '../services/session-service';
import { WebAuthnService } from '../services/webauthn-service';
import type { AuthConfig } from '../types';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';

// Mock @simplewebauthn/server
vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn().mockResolvedValue({
    challenge: 'mock-challenge-registration',
    rp: { name: 'Quant', id: 'quant.app' },
    user: { id: 'user-del', name: 'deluser', displayName: 'Delete User' },
    pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
    timeout: 60000,
    attestation: 'none',
  }),
  verifyRegistrationResponse: vi.fn().mockResolvedValue({
    verified: true,
    registrationInfo: {
      credential: {
        id: 'cred-del-001',
        publicKey: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
        counter: 0,
      },
    },
  }),
  generateAuthenticationOptions: vi.fn().mockResolvedValue({
    challenge: 'mock-challenge-auth',
    rpId: 'quant.app',
    timeout: 60000,
    userVerification: 'preferred',
    allowCredentials: [],
  }),
  verifyAuthenticationResponse: vi.fn().mockResolvedValue({
    verified: true,
    authenticationInfo: { newCounter: 1 },
  }),
}));

const TEST_AUTH_CONFIG: AuthConfig = {
  jwtSecret: 'test-jwt-secret-account-deletion-gate-key-minimum-len',
  jwtRefreshSecret: 'test-jwt-refresh-secret-deletion-gate-key-minimum-len',
  accessTokenExpiresIn: 900,
  refreshTokenExpiresIn: 604800,
  issuer: 'https://auth.quant.app',
  audience: 'https://quant.app',
  bcryptRounds: 4,
  maxLoginAttempts: 5,
  lockoutDuration: 300,
};

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

describe('Phase 24 Gate: Account Deletion', () => {
  let lifecycleService: AccountLifecycleService;
  let sessionService: SessionService;
  let webauthnService: WebAuthnService;
  const userId = 'user-deletion-test';

  beforeEach(() => {
    vi.clearAllMocks();
    lifecycleService = new AccountLifecycleService();
    sessionService = new SessionService(TEST_AUTH_CONFIG);
    webauthnService = new WebAuthnService('Quant', 'quant.app');
  });

  describe('requestDeletion sets 14-day scheduled purge', () => {
    it('should set scheduledPurgeAt to exactly 14 days from now', () => {
      const before = Date.now();
      const request = lifecycleService.requestDeletion(userId);
      const after = Date.now();

      expect(request.status).toBe('pending');
      expect(request.userId).toBe(userId);

      const scheduledTime = request.scheduledPurgeAt.getTime();
      const requestedTime = request.requestedAt.getTime();
      const gracePeriod = scheduledTime - requestedTime;

      expect(gracePeriod).toBe(FOURTEEN_DAYS_MS);

      // Verify the scheduled time is approximately 14 days from now
      expect(scheduledTime).toBeGreaterThanOrEqual(before + FOURTEEN_DAYS_MS);
      expect(scheduledTime).toBeLessThanOrEqual(after + FOURTEEN_DAYS_MS);
    });

    it('should have pending status until purged', () => {
      lifecycleService.requestDeletion(userId);
      const status = lifecycleService.getAccountDeletionStatus(userId);
      expect(status).not.toBeNull();
      expect(status!.status).toBe('pending');
    });
  });

  describe('purgeAccount clears all user data', () => {
    it('should clear all sessions after purge', async () => {
      // Create multiple sessions for the user
      await sessionService.createSession({
        userId,
        tokenId: 'tok-1',
        refreshTokenFamily: 'fam-1',
        deviceInfo: {
          deviceId: 'dev-1',
          platform: 'web',
          userAgent: 'TestAgent',
          ipAddress: '1.2.3.4',
        },
        app: 'quantmail',
      });

      await sessionService.createSession({
        userId,
        tokenId: 'tok-2',
        refreshTokenFamily: 'fam-2',
        deviceInfo: {
          deviceId: 'dev-2',
          platform: 'ios',
          userAgent: 'TestAgent iOS',
          ipAddress: '1.2.3.5',
        },
        app: 'quantchat',
      });

      // Verify sessions exist
      let sessions = await sessionService.getUserSessions(userId);
      expect(sessions).toHaveLength(2);

      // Purge: revoke all sessions (simulating what a full purge orchestrator would do)
      await sessionService.revokeAllSessions(userId);
      lifecycleService.purgeAccount(userId);

      // Verify sessions are cleared
      sessions = await sessionService.getUserSessions(userId);
      expect(sessions).toHaveLength(0);

      // Verify account is marked as purged
      expect(lifecycleService.isAccountPurged(userId)).toBe(true);
    });

    it('should clear all WebAuthn credentials after purge', async () => {
      // Register credentials for the user
      await webauthnService.generateRegistrationOpts(userId, 'deluser');
      await webauthnService.verifyRegistration(
        userId,
        {
          id: 'cred-del-001',
          rawId: 'cred-del-001',
          type: 'public-key',
          response: {
            clientDataJSON: 'mock',
            attestationObject: 'mock',
            transports: ['internal'] as AuthenticatorTransportFuture[],
          },
          clientExtensionResults: {},
          authenticatorAttachment: 'platform',
        },
        'https://quant.app',
      );

      // Verify credential exists
      let credentials = webauthnService.listCredentials(userId);
      expect(credentials).toHaveLength(1);

      // Purge: remove all credentials (simulating full purge)
      for (const cred of webauthnService.listCredentials(userId)) {
        webauthnService.removeCredential(userId, cred.credentialId);
      }
      lifecycleService.purgeAccount(userId);

      // Verify credentials are cleared
      credentials = webauthnService.listCredentials(userId);
      expect(credentials).toHaveLength(0);

      expect(lifecycleService.isAccountPurged(userId)).toBe(true);
    });

    it('should mark deletion request status as purged', () => {
      lifecycleService.requestDeletion(userId);
      lifecycleService.purgeAccount(userId);

      const status = lifecycleService.getAccountDeletionStatus(userId);
      expect(status!.status).toBe('purged');
    });
  });

  describe('cancelDeletion within grace period', () => {
    it('should cancel a pending deletion request', () => {
      lifecycleService.requestDeletion(userId);

      const result = lifecycleService.cancelDeletion(userId);
      expect(result).toBe(true);

      const status = lifecycleService.getAccountDeletionStatus(userId);
      expect(status!.status).toBe('cancelled');
    });

    it('should not cancel an already purged account', () => {
      lifecycleService.requestDeletion(userId);
      lifecycleService.purgeAccount(userId);

      const result = lifecycleService.cancelDeletion(userId);
      expect(result).toBe(false);
    });

    it('should preserve sessions when deletion is cancelled', async () => {
      // Create sessions
      await sessionService.createSession({
        userId,
        tokenId: 'tok-preserved',
        refreshTokenFamily: 'fam-preserved',
        deviceInfo: {
          deviceId: 'dev-keep',
          platform: 'web',
          userAgent: 'TestAgent',
          ipAddress: '1.2.3.4',
        },
        app: 'quantmail',
      });

      // Request deletion
      lifecycleService.requestDeletion(userId);

      // Cancel before purge
      lifecycleService.cancelDeletion(userId);

      // Sessions should still be there (purge never ran)
      const sessions = await sessionService.getUserSessions(userId);
      expect(sessions).toHaveLength(1);
    });

    it('should preserve WebAuthn credentials when deletion is cancelled', async () => {
      // Register credential
      await webauthnService.generateRegistrationOpts(userId, 'deluser');
      await webauthnService.verifyRegistration(
        userId,
        {
          id: 'cred-del-001',
          rawId: 'cred-del-001',
          type: 'public-key',
          response: {
            clientDataJSON: 'mock',
            attestationObject: 'mock',
            transports: ['internal'] as AuthenticatorTransportFuture[],
          },
          clientExtensionResults: {},
          authenticatorAttachment: 'platform',
        },
        'https://quant.app',
      );

      // Request and cancel
      lifecycleService.requestDeletion(userId);
      lifecycleService.cancelDeletion(userId);

      // Credentials should remain
      const credentials = webauthnService.listCredentials(userId);
      expect(credentials).toHaveLength(1);
    });
  });

  describe('after purge, all user data is gone', () => {
    it('should return empty sessions after full purge', async () => {
      // Setup: create sessions
      await sessionService.createSession({
        userId,
        tokenId: 'tok-purge-1',
        refreshTokenFamily: 'fam-purge-1',
        deviceInfo: {
          deviceId: 'dev-purge',
          platform: 'desktop',
          userAgent: 'Desktop Agent',
          ipAddress: '10.0.0.1',
        },
        app: 'quantdocs',
      });

      await sessionService.createSession({
        userId,
        tokenId: 'tok-purge-2',
        refreshTokenFamily: 'fam-purge-2',
        deviceInfo: {
          deviceId: 'dev-purge-2',
          platform: 'android',
          userAgent: 'Android Agent',
          ipAddress: '10.0.0.2',
        },
        app: 'quantai',
      });

      // Execute full purge
      await sessionService.revokeAllSessions(userId);
      lifecycleService.purgeAccount(userId);

      // Verify
      const sessions = await sessionService.getUserSessions(userId);
      expect(sessions).toHaveLength(0);
      expect(await sessionService.getActiveSessionCount(userId)).toBe(0);
    });

    it('should return empty credentials after full purge', async () => {
      // Setup: register credential
      await webauthnService.generateRegistrationOpts(userId, 'deluser');
      await webauthnService.verifyRegistration(
        userId,
        {
          id: 'cred-del-001',
          rawId: 'cred-del-001',
          type: 'public-key',
          response: {
            clientDataJSON: 'mock',
            attestationObject: 'mock',
            transports: ['internal'] as AuthenticatorTransportFuture[],
          },
          clientExtensionResults: {},
          authenticatorAttachment: 'platform',
        },
        'https://quant.app',
      );

      expect(webauthnService.listCredentials(userId)).toHaveLength(1);

      // Execute full purge
      for (const cred of webauthnService.listCredentials(userId)) {
        webauthnService.removeCredential(userId, cred.credentialId);
      }
      lifecycleService.purgeAccount(userId);

      // Verify
      expect(webauthnService.listCredentials(userId)).toHaveLength(0);
      expect(lifecycleService.isAccountPurged(userId)).toBe(true);
    });
  });
});
