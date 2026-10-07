import { describe, it, expect, beforeEach } from 'vitest';
import { GitAuthService } from '../services/auth.js';

describe('GitAuthService', () => {
  let service: GitAuthService;

  beforeEach(() => {
    service = new GitAuthService();
  });

  describe('generateToken', () => {
    it('generates a hex token string', () => {
      const token = service.generateToken('user-1', ['repo:read', 'repo:write']);
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it('generates unique tokens for each call', () => {
      const token1 = service.generateToken('user-1', ['repo:read']);
      const token2 = service.generateToken('user-1', ['repo:read']);
      expect(token1).not.toBe(token2);
    });
  });

  describe('validateToken', () => {
    it('validates a previously generated token', async () => {
      const token = service.generateToken('user-1', ['repo:read', 'repo:write']);
      const result = await service.validateToken(token);
      expect(result).toEqual({ userId: 'user-1', scopes: ['repo:read', 'repo:write'] });
    });

    it('returns null for an invalid token', async () => {
      const result = await service.validateToken('invalid-token-value');
      expect(result).toBeNull();
    });

    it('returns null for an empty token', async () => {
      const result = await service.validateToken('');
      expect(result).toBeNull();
    });

    it('validates tokens with different scopes independently', async () => {
      const token1 = service.generateToken('user-1', ['repo:read']);
      const token2 = service.generateToken('user-2', ['repo:write', 'admin']);

      const result1 = await service.validateToken(token1);
      const result2 = await service.validateToken(token2);

      expect(result1).toEqual({ userId: 'user-1', scopes: ['repo:read'] });
      expect(result2).toEqual({ userId: 'user-2', scopes: ['repo:write', 'admin'] });
    });
  });
});
