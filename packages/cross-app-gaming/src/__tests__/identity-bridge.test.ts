import { describe, it, expect } from 'vitest';
import { IdentityBridgeService } from '../services/identity-bridge.service.js';

describe('IdentityBridgeService', () => {
  function createService() {
    return new IdentityBridgeService({
      defaultIdentityMode: 'revealed',
    });
  }

  describe('createAnonymousIdentity', () => {
    it('should create an anonymous identity without exposing real user ID', () => {
      const service = createService();
      const identity = service.createAnonymousIdentity('user-123');

      expect(identity.anonymousId).toBeDefined();
      expect(identity.anonymousId).not.toBe('user-123');
      expect(identity.displayName).not.toBe('user-123');
      // The public identity must NOT contain realUserId
      expect('realUserId' in identity).toBe(false);
    });

    it('should return the same anonymous ID for the same user', () => {
      const service = createService();
      const first = service.createAnonymousIdentity('user-123');
      const second = service.createAnonymousIdentity('user-123');

      expect(first.anonymousId).toBe(second.anonymousId);
      expect(first.displayName).toBe(second.displayName);
    });
  });

  describe('revealIdentity', () => {
    it('should create a consent record', () => {
      const service = createService();
      const consent = service.revealIdentity('user-a', 'user-b', true);

      expect(consent.fromUserId).toBe('user-a');
      expect(consent.toUserId).toBe('user-b');
      expect(consent.revoked).toBe(false);
    });

    it('should throw when consent is not given', () => {
      const service = createService();

      expect(() => service.revealIdentity('user-a', 'user-b', false)).toThrow(
        'Identity reveal requires explicit consent',
      );
    });
  });

  describe('revokeConsent', () => {
    it('should revoke an existing consent record', () => {
      const service = createService();
      service.revealIdentity('user-a', 'user-b', true);
      service.revokeConsent('user-a', 'user-b');

      // After revocation, mutual consent is broken
      service.revealIdentity('user-b', 'user-a', true);
      expect(service.hasMutualConsent('user-a', 'user-b')).toBe(false);
    });

    it('should cause getDisplayIdentity to return anonymous after revocation', () => {
      const service = createService();
      service.createAnonymousIdentity('user-a');
      service.revealIdentity('user-a', 'user-b', true);
      service.revealIdentity('user-b', 'user-a', true);

      // Before revocation: revealed
      const before = service.getDisplayIdentity('user-a', 'user-b', 'random_match');
      expect(before.identityMode).toBe('revealed');

      // Revoke
      service.revokeConsent('user-a', 'user-b');

      // After revocation: anonymous again
      const after = service.getDisplayIdentity('user-a', 'user-b', 'random_match');
      expect(after.identityMode).toBe('anonymous');
    });

    it('should throw when no consent record exists', () => {
      const service = createService();

      expect(() => service.revokeConsent('user-a', 'user-b')).toThrow(
        'No consent record found to revoke',
      );
    });
  });

  describe('getDisplayIdentity', () => {
    it('should return anonymous identity in random_match context', () => {
      const service = createService();
      service.createAnonymousIdentity('user-123');
      const display = service.getDisplayIdentity('user-123', 'viewer-1', 'random_match');

      expect(display.identityMode).toBe('anonymous');
      expect(display.displayName).not.toBe('user-123');
    });

    it('should reveal identity when mutual consent exists in random_match', () => {
      const service = createService();
      service.createAnonymousIdentity('user-a');
      service.revealIdentity('user-a', 'user-b', true);
      service.revealIdentity('user-b', 'user-a', true);

      const display = service.getDisplayIdentity('user-a', 'user-b', 'random_match');
      expect(display.identityMode).toBe('revealed');
      expect(display.displayName).toBe('user-a');
    });

    it('should stay anonymous without mutual consent in random_match', () => {
      const service = createService();
      service.createAnonymousIdentity('user-a');
      service.revealIdentity('user-a', 'user-b', true);
      // user-b has NOT consented back

      const display = service.getDisplayIdentity('user-a', 'user-b', 'random_match');
      expect(display.identityMode).toBe('anonymous');
    });

    it('should use default identity mode in non-random contexts', () => {
      const service = createService();
      const display = service.getDisplayIdentity('user-123', 'viewer-1', 'chat_embed');

      expect(display.identityMode).toBe('revealed');
      expect(display.displayName).toBe('user-123');
    });
  });

  describe('linkCrossAppSession', () => {
    it('should link a session to a user', () => {
      const service = createService();
      service.linkCrossAppSession('user-1', 'session-1', 'chat_embed');
      service.linkCrossAppSession('user-1', 'session-2', 'fullscreen');

      const history = service.getPlayerHistory('user-1');
      expect(history).toHaveLength(2);
      expect(history[0]!.appContext).toBe('chat_embed');
      expect(history[1]!.appContext).toBe('fullscreen');
    });

    it('should return empty history for unknown user', () => {
      const service = createService();
      const history = service.getPlayerHistory('unknown');
      expect(history).toEqual([]);
    });
  });

  describe('hasMutualConsent', () => {
    it('should return true when both users have consented', () => {
      const service = createService();
      service.revealIdentity('user-a', 'user-b', true);
      service.revealIdentity('user-b', 'user-a', true);

      expect(service.hasMutualConsent('user-a', 'user-b')).toBe(true);
    });

    it('should return false without mutual consent', () => {
      const service = createService();
      service.revealIdentity('user-a', 'user-b', true);

      expect(service.hasMutualConsent('user-a', 'user-b')).toBe(false);
    });
  });
});
