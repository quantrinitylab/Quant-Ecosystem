import { describe, it, expect, beforeEach } from 'vitest';
import { FederatedIdentityService } from '../services/federated-identity-service';

describe('FederatedIdentityService', () => {
  let service: FederatedIdentityService;

  beforeEach(() => {
    service = new FederatedIdentityService();
  });

  describe('registerClient', () => {
    it('should register a new federated client', () => {
      const client = service.registerClient('user-1', {
        name: 'My App',
        website: 'https://myapp.com',
        redirectUris: ['https://myapp.com/callback'],
        allowedScopes: ['profile:read', 'email:read'],
      });

      expect(client.clientId).toBeDefined();
      expect(client.clientSecret).toBeDefined();
      expect(client.name).toBe('My App');
      expect(client.website).toBe('https://myapp.com');
      expect(client.redirectUris).toEqual(['https://myapp.com/callback']);
      expect(client.allowedScopes).toEqual(['profile:read', 'email:read']);
      expect(client.createdBy).toBe('user-1');
      expect(client.createdAt).toBeInstanceOf(Date);
    });

    it('should register multiple clients for the same owner', () => {
      service.registerClient('user-1', {
        name: 'App 1',
        website: 'https://app1.com',
        redirectUris: ['https://app1.com/cb'],
        allowedScopes: ['profile:read'],
      });
      service.registerClient('user-1', {
        name: 'App 2',
        website: 'https://app2.com',
        redirectUris: ['https://app2.com/cb'],
        allowedScopes: ['profile:read'],
      });

      const clients = service.listUserClients('user-1');
      expect(clients).toHaveLength(2);
    });
  });

  describe('generateClientCredentials', () => {
    it('should generate unique client ID and secret', () => {
      const creds1 = service.generateClientCredentials();
      const creds2 = service.generateClientCredentials();

      expect(creds1.clientId).toBeDefined();
      expect(creds1.clientSecret).toBeDefined();
      expect(creds1.clientId).not.toBe(creds2.clientId);
      expect(creds1.clientSecret).not.toBe(creds2.clientSecret);
    });

    it('should generate secret with qfs_ prefix', () => {
      const creds = service.generateClientCredentials();
      expect(creds.clientSecret).toMatch(/^qfs_/);
    });

    it('should generate client ID with qfc_ prefix', () => {
      const creds = service.generateClientCredentials();
      expect(creds.clientId).toMatch(/^qfc_/);
    });
  });

  describe('validateClientRedirectUri', () => {
    it('should return true for a valid redirect URI', () => {
      const client = service.registerClient('user-1', {
        name: 'App',
        website: 'https://app.com',
        redirectUris: ['https://app.com/callback', 'https://app.com/auth'],
        allowedScopes: ['profile:read'],
      });

      expect(service.validateClientRedirectUri(client.clientId, 'https://app.com/callback')).toBe(
        true,
      );
      expect(service.validateClientRedirectUri(client.clientId, 'https://app.com/auth')).toBe(true);
    });

    it('should return false for an invalid redirect URI', () => {
      const client = service.registerClient('user-1', {
        name: 'App',
        website: 'https://app.com',
        redirectUris: ['https://app.com/callback'],
        allowedScopes: ['profile:read'],
      });

      expect(service.validateClientRedirectUri(client.clientId, 'https://evil.com/callback')).toBe(
        false,
      );
    });

    it('should return false for non-existent client', () => {
      expect(service.validateClientRedirectUri('non-existent', 'https://app.com/cb')).toBe(false);
    });
  });

  describe('getClientInfo', () => {
    it('should return client info without the secret', () => {
      const client = service.registerClient('user-1', {
        name: 'App',
        website: 'https://app.com',
        redirectUris: ['https://app.com/callback'],
        allowedScopes: ['profile:read'],
      });

      const info = service.getClientInfo(client.clientId);
      expect(info).not.toBeNull();
      expect(info!.name).toBe('App');
      expect(info!.clientId).toBe(client.clientId);
      expect(Object.keys(info!)).not.toContain('clientSecret');
    });

    it('should return null for non-existent client', () => {
      expect(service.getClientInfo('non-existent')).toBeNull();
    });
  });

  describe('listUserClients', () => {
    it('should return empty array for user with no clients', () => {
      expect(service.listUserClients('user-none')).toEqual([]);
    });

    it('should return only clients owned by the specified user', () => {
      service.registerClient('user-1', {
        name: 'User 1 App',
        website: 'https://u1.com',
        redirectUris: ['https://u1.com/cb'],
        allowedScopes: ['profile:read'],
      });
      service.registerClient('user-2', {
        name: 'User 2 App',
        website: 'https://u2.com',
        redirectUris: ['https://u2.com/cb'],
        allowedScopes: ['profile:read'],
      });

      const user1Clients = service.listUserClients('user-1');
      expect(user1Clients).toHaveLength(1);
      expect(user1Clients[0]!.name).toBe('User 1 App');
    });
  });

  describe('revokeClient', () => {
    it('should revoke an existing client', () => {
      const client = service.registerClient('user-1', {
        name: 'App',
        website: 'https://app.com',
        redirectUris: ['https://app.com/cb'],
        allowedScopes: ['profile:read'],
      });

      const result = service.revokeClient(client.clientId);
      expect(result).toBe(true);
      expect(service.getClientInfo(client.clientId)).toBeNull();
      expect(service.listUserClients('user-1')).toHaveLength(0);
    });

    it('should return false for non-existent client', () => {
      expect(service.revokeClient('non-existent')).toBe(false);
    });
  });
});
