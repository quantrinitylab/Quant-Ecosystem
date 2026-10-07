import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebAuthnService } from '../services/webauthn-service';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/server';

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
        id: 'cred-123',
        publicKey: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
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

function makeRegResponse(overrides?: Partial<RegistrationResponseJSON>): RegistrationResponseJSON {
  return {
    id: 'cred-123',
    rawId: 'cred-123',
    type: 'public-key',
    response: {
      clientDataJSON: 'mock-client-data',
      attestationObject: 'mock-attestation',
      transports: ['internal'] as AuthenticatorTransportFuture[],
    },
    clientExtensionResults: {},
    authenticatorAttachment: 'platform',
    ...overrides,
  };
}

function makeAuthResponse(): AuthenticationResponseJSON {
  return {
    id: 'cred-123',
    rawId: 'cred-123',
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

describe('WebAuthnService E2E', () => {
  let service: WebAuthnService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WebAuthnService('Quant', 'quant.app');
  });

  describe('full passkey enrollment flow', () => {
    it('should generate registration options', async () => {
      const result = await service.generateRegistrationOpts('user-1', 'testuser');

      expect(result.options).toBeDefined();
      expect(result.options.challenge).toBe('mock-challenge-registration');
    });

    it('should verify registration and store credential', async () => {
      // Step 1: Generate options (stores challenge)
      await service.generateRegistrationOpts('user-1', 'testuser');

      // Step 2: Verify registration response
      const result = await service.verifyRegistration(
        'user-1',
        makeRegResponse(),
        'https://quant.app',
      );

      expect(result.verified).toBe(true);
      expect(result.credential).toBeDefined();
      expect(result.credential!.credentialId).toBe('cred-123');
      expect(result.credential!.counter).toBe(0);
    });

    it('should store credential in credential store after registration', async () => {
      await service.generateRegistrationOpts('user-1', 'testuser');
      await service.verifyRegistration('user-1', makeRegResponse(), 'https://quant.app');

      const credentials = service.listCredentials('user-1');
      expect(credentials).toHaveLength(1);
      expect(credentials[0]!.credentialId).toBe('cred-123');
    });
  });

  describe('full passkey authentication flow', () => {
    it('should generate authentication options', async () => {
      const result = await service.generateAuthenticationOpts('user-1', []);

      expect(result.options).toBeDefined();
      expect(result.options.challenge).toBe('mock-challenge-authentication');
    });

    it('should verify authentication response', async () => {
      // Setup: register a credential first
      await service.generateRegistrationOpts('user-1', 'testuser');
      const regResult = await service.verifyRegistration(
        'user-1',
        makeRegResponse(),
        'https://quant.app',
      );
      const credential = regResult.credential!;

      // Step 1: Generate auth options
      await service.generateAuthenticationOpts('user-1', [credential]);

      // Step 2: Verify authentication
      const authResult = await service.verifyAuthentication(
        'user-1',
        makeAuthResponse(),
        'https://quant.app',
        credential,
      );

      expect(authResult.verified).toBe(true);
      expect(authResult.newCounter).toBe(1);
    });
  });

  describe('credential listing', () => {
    it('should return empty array for user with no credentials', () => {
      const credentials = service.listCredentials('user-none');
      expect(credentials).toEqual([]);
    });

    it('should list all credentials for a user', async () => {
      await service.generateRegistrationOpts('user-1', 'testuser');
      await service.verifyRegistration('user-1', makeRegResponse(), 'https://quant.app');

      const credentials = service.listCredentials('user-1');
      expect(credentials).toHaveLength(1);
    });
  });

  describe('credential removal', () => {
    it('should remove a credential', async () => {
      await service.generateRegistrationOpts('user-1', 'testuser');
      await service.verifyRegistration('user-1', makeRegResponse(), 'https://quant.app');

      const removed = service.removeCredential('user-1', 'cred-123');
      expect(removed).toBe(true);
      expect(service.listCredentials('user-1')).toHaveLength(0);
    });

    it('should return false for non-existent credential', () => {
      expect(service.removeCredential('user-1', 'non-existent')).toBe(false);
    });

    it('should return false for non-existent user', () => {
      expect(service.removeCredential('user-none', 'cred-1')).toBe(false);
    });
  });

  describe('credential renaming', () => {
    it('should rename a credential', async () => {
      await service.generateRegistrationOpts('user-1', 'testuser');
      await service.verifyRegistration('user-1', makeRegResponse(), 'https://quant.app');

      const renamed = service.renameCredential('user-1', 'cred-123', 'My Laptop Key');
      expect(renamed).toBe(true);

      const credentials = service.listCredentials('user-1');
      expect(credentials[0]!.name).toBe('My Laptop Key');
    });

    it('should return false for non-existent credential', () => {
      expect(service.renameCredential('user-1', 'non-existent', 'Name')).toBe(false);
    });
  });
});
