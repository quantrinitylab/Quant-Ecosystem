import { describe, it, expect, beforeEach } from 'vitest';
import { ConsentManager } from '../core/consent-manager.js';

describe('ConsentManager', () => {
  let manager: ConsentManager;

  beforeEach(() => {
    manager = new ConsentManager();
  });

  describe('requestConsent', () => {
    it('creates a consent prompt and returns id', () => {
      const id = manager.requestConsent('user-1', 'agent-1', 'email', 'Need email access');
      expect(id).toBeDefined();
      expect(id.startsWith('consent-')).toBe(true);
    });
  });

  describe('recordResponse', () => {
    it('records a granted response', () => {
      const id = manager.requestConsent('user-1', 'agent-1', 'email', 'Need access');
      expect(manager.recordResponse(id, 'user-1', true)).toBe(true);
      expect(manager.hasConsent('user-1', 'agent-1', 'email')).toBe(true);
    });

    it('records a denied response', () => {
      const id = manager.requestConsent('user-1', 'agent-1', 'email', 'Need access');
      expect(manager.recordResponse(id, 'user-1', false)).toBe(true);
      expect(manager.hasConsent('user-1', 'agent-1', 'email')).toBe(false);
    });

    it('returns false for invalid prompt', () => {
      expect(manager.recordResponse('invalid', 'user-1', true)).toBe(false);
    });

    it('returns false if userId does not match', () => {
      const id = manager.requestConsent('user-1', 'agent-1', 'email', 'Reason');
      expect(manager.recordResponse(id, 'user-2', true)).toBe(false);
    });
  });

  describe('hasConsent', () => {
    it('returns false if no consent prompt exists', () => {
      expect(manager.hasConsent('user-1', 'agent-1', 'email')).toBe(false);
    });

    it('returns true only for granted consent', () => {
      const id = manager.requestConsent('user-1', 'agent-1', 'email', 'Reason');
      manager.recordResponse(id, 'user-1', true);
      expect(manager.hasConsent('user-1', 'agent-1', 'email')).toBe(true);
    });
  });

  describe('revokeConsent', () => {
    it('revokes a granted consent', () => {
      const id = manager.requestConsent('user-1', 'agent-1', 'email', 'Reason');
      manager.recordResponse(id, 'user-1', true);
      expect(manager.revokeConsent(id)).toBe(true);
      expect(manager.hasConsent('user-1', 'agent-1', 'email')).toBe(false);
    });

    it('returns false if no response exists', () => {
      expect(manager.revokeConsent('unknown')).toBe(false);
    });
  });

  describe('getActiveConsents', () => {
    it('returns all granted consents for a user', () => {
      const id1 = manager.requestConsent('user-1', 'agent-1', 'email', 'R1');
      const id2 = manager.requestConsent('user-1', 'agent-2', 'doc', 'R2');
      manager.requestConsent('user-1', 'agent-3', 'file', 'R3');
      manager.recordResponse(id1, 'user-1', true);
      manager.recordResponse(id2, 'user-1', true);

      const consents = manager.getActiveConsents('user-1');
      expect(consents).toHaveLength(2);
    });
  });

  describe('data usage', () => {
    it('logs and retrieves data usage explanation', () => {
      manager.logDataUsage('sugg-1', 'agent-1', ['res-1', 'res-2'], 'Used for recommendation');
      const explanation = manager.getDataUsageExplanation('sugg-1');
      expect(explanation).toHaveLength(1);
      expect(explanation?.[0]?.agentId).toBe('agent-1');
      expect(explanation?.[0]?.resourceIds).toEqual(['res-1', 'res-2']);
    });

    it('returns undefined for unknown suggestion', () => {
      expect(manager.getDataUsageExplanation('unknown')).toBeUndefined();
    });

    it('getAIDataUsagePanel returns panel data', () => {
      const id = manager.requestConsent('user-1', 'agent-1', 'email', 'Reason');
      manager.recordResponse(id, 'user-1', true);
      manager.logDataUsage('sugg-1', 'agent-1', ['res-1'], 'Used data');

      const panel = manager.getAIDataUsagePanel('user-1');
      expect(panel).toHaveLength(1);
      expect(panel[0]?.usage).toHaveLength(1);
    });
  });

  describe('consent ledger', () => {
    describe('grantConsent', () => {
      it('grants consent and returns an id', () => {
        const id = manager.grantConsent('user-1', 'email:read', 'quantmail-app');
        expect(id).toBeDefined();
        expect(id.startsWith('ledger-')).toBe(true);
      });

      it('records consent with correct fields', () => {
        manager.grantConsent('user-1', 'email:read', 'quantmail-app', 9999999999999);
        const history = manager.getConsentHistory('user-1');
        expect(history).toHaveLength(1);
        expect(history[0]?.userId).toBe('user-1');
        expect(history[0]?.scope).toBe('email:read');
        expect(history[0]?.source).toBe('quantmail-app');
        expect(history[0]?.expiry).toBe(9999999999999);
        expect(history[0]?.withdrawnAt).toBeUndefined();
        expect(history[0]?.grantedAt).toBeGreaterThan(0);
      });

      it('allows multiple consents for the same user', () => {
        manager.grantConsent('user-1', 'email:read', 'quantmail-app');
        manager.grantConsent('user-1', 'doc:write', 'docs-app');
        manager.grantConsent('user-1', 'video:share', 'video-app');
        const history = manager.getConsentHistory('user-1');
        expect(history).toHaveLength(3);
      });
    });

    describe('withdrawConsent', () => {
      it('withdraws an active consent immediately', () => {
        const id = manager.grantConsent('user-1', 'email:read', 'quantmail-app');
        expect(manager.isConsentValid(id)).toBe(true);
        const result = manager.withdrawConsent(id);
        expect(result).toBe(true);
        expect(manager.isConsentValid(id)).toBe(false);
      });

      it('returns false for unknown consent id', () => {
        expect(manager.withdrawConsent('unknown-id')).toBe(false);
      });

      it('returns false if already withdrawn', () => {
        const id = manager.grantConsent('user-1', 'email:read', 'quantmail-app');
        manager.withdrawConsent(id);
        expect(manager.withdrawConsent(id)).toBe(false);
      });

      it('sets withdrawnAt timestamp', () => {
        const id = manager.grantConsent('user-1', 'email:read', 'quantmail-app');
        manager.withdrawConsent(id);
        const history = manager.getConsentHistory('user-1');
        const entry = history.find((e) => e.id === id);
        expect(entry?.withdrawnAt).toBeGreaterThan(0);
      });
    });

    describe('getConsentHistory', () => {
      it('returns empty array for user with no consents', () => {
        expect(manager.getConsentHistory('nobody')).toEqual([]);
      });

      it('includes both active and withdrawn consents', () => {
        const id1 = manager.grantConsent('user-1', 'email:read', 'app-1');
        manager.grantConsent('user-1', 'doc:write', 'app-2');
        manager.withdrawConsent(id1);

        const history = manager.getConsentHistory('user-1');
        expect(history).toHaveLength(2);
        expect(history.filter((e) => e.withdrawnAt !== undefined)).toHaveLength(1);
        expect(history.filter((e) => e.withdrawnAt === undefined)).toHaveLength(1);
      });
    });

    describe('getActiveConsentsForUser', () => {
      it('returns only non-withdrawn, non-expired consents', () => {
        manager.grantConsent('user-1', 'email:read', 'app-1');
        manager.grantConsent('user-1', 'doc:write', 'app-2');
        const id3 = manager.grantConsent('user-1', 'video:share', 'app-3');
        manager.withdrawConsent(id3);

        const active = manager.getActiveConsentsForUser('user-1');
        expect(active).toHaveLength(2);
      });

      it('excludes expired consents', () => {
        // Grant with already-expired timestamp
        manager.grantConsent('user-1', 'email:read', 'app-1', 1); // expiry = 1ms (past)
        manager.grantConsent('user-1', 'doc:write', 'app-2', 9999999999999); // far future

        const active = manager.getActiveConsentsForUser('user-1');
        expect(active).toHaveLength(1);
        expect(active[0]?.scope).toBe('doc:write');
      });

      it('returns empty array for user with no active consents', () => {
        expect(manager.getActiveConsentsForUser('nobody')).toEqual([]);
      });
    });

    describe('isConsentValid', () => {
      it('returns true for active non-expired consent', () => {
        const id = manager.grantConsent('user-1', 'email:read', 'app-1', 9999999999999);
        expect(manager.isConsentValid(id)).toBe(true);
      });

      it('returns false for withdrawn consent', () => {
        const id = manager.grantConsent('user-1', 'email:read', 'app-1');
        manager.withdrawConsent(id);
        expect(manager.isConsentValid(id)).toBe(false);
      });

      it('returns false for expired consent', () => {
        const id = manager.grantConsent('user-1', 'email:read', 'app-1', 1); // expired
        expect(manager.isConsentValid(id)).toBe(false);
      });

      it('returns false for unknown consent id', () => {
        expect(manager.isConsentValid('unknown-id')).toBe(false);
      });

      it('returns true for consent with no expiry', () => {
        const id = manager.grantConsent('user-1', 'email:read', 'app-1');
        expect(manager.isConsentValid(id)).toBe(true);
      });
    });
  });
});
