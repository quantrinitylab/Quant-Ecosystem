import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionEngine } from '../core/permission-engine.js';
import { ConsentManager } from '../core/consent-manager.js';
import { ALL_RESOURCE_CONTRACTS } from '../core/resource-contracts.js';
import type {
  PermissionSubject,
  PlatformRole,
  PermissionAction,
  ResourceType,
  ABACContext,
} from '../types.js';

describe('Phase 24 Gates: Permission Engine Performance + Correctness', () => {
  let engine: PermissionEngine;

  beforeEach(() => {
    engine = new PermissionEngine();
    engine.registerContracts(ALL_RESOURCE_CONTRACTS);
  });

  describe('performance gate: p99 < 5ms for can()', () => {
    it('should complete 1000 can() calls with p99 < 5ms', () => {
      const subject: PermissionSubject = { userId: 'perf-user', roles: ['USER', 'CREATOR'] };
      const context: ABACContext = { trustScore: 80, device: 'desktop', location: 'US' };

      // Add a policy with ABAC conditions to exercise full code path
      engine.addPolicy({
        roles: ['USER', 'CREATOR'],
        actions: ['read', 'write', 'share', 'monetize'],
        resourceTypes: ['post', 'video', 'doc', 'email'],
        conditions: [
          { attribute: 'trustScore', operator: 'gte', value: 50 },
          { attribute: 'device', operator: 'in', value: ['desktop', 'mobile-trusted'] },
        ],
      });

      // Warm up
      for (let i = 0; i < 10; i++) {
        engine.can(subject, 'read', 'post', context);
      }

      // Benchmark: run 1000 iterations, collect individual times
      const times: number[] = [];
      for (let i = 0; i < 1000; i++) {
        const start = performance.now();
        engine.can(subject, 'read', 'post', context);
        const elapsed = performance.now() - start;
        times.push(elapsed);
      }

      // Sort and get p99
      times.sort((a, b) => a - b);
      const p99 = times[989]!; // 0-indexed, 990th element is p99 for 1000 items
      expect(p99).toBeLessThan(5);
    });

    it('should maintain p99 < 5ms with complex multi-role subjects', () => {
      const subject: PermissionSubject = {
        userId: 'complex-user',
        roles: ['USER', 'CREATOR', 'ADVERTISER'],
      };
      const context: ABACContext = { trustScore: 90, device: 'desktop', location: 'EU' };

      engine.addPolicy({
        roles: ['USER', 'CREATOR', 'ADVERTISER'],
        actions: ['read', 'write', 'share', 'monetize'],
        resourceTypes: ['post', 'video', 'campaign', 'ad'],
        conditions: [
          { attribute: 'trustScore', operator: 'gte', value: 70 },
          { attribute: 'location', operator: 'in', value: ['US', 'EU', 'UK'] },
        ],
      });

      // Warm up
      engine.can(subject, 'write', 'campaign', context);

      const times: number[] = [];
      for (let i = 0; i < 1000; i++) {
        const start = performance.now();
        engine.can(subject, 'write', 'campaign', context);
        const elapsed = performance.now() - start;
        times.push(elapsed);
      }

      times.sort((a, b) => a - b);
      const p99 = times[989]!;
      expect(p99).toBeLessThan(5);
    });
  });

  describe('correctness gate: all 6 roles x 6 actions x resource types', () => {
    const roles: PlatformRole[] = ['USER', 'ADMIN', 'MODERATOR', 'CREATOR', 'ADVERTISER', 'AGENT'];
    const actions: PermissionAction[] = [
      'read',
      'write',
      'delete',
      'share',
      'monetize',
      'agent-act',
    ];
    const resourceTypes: ResourceType[] = [
      'email',
      'message',
      'post',
      'video',
      'file',
      'doc',
      'meeting',
      'campaign',
      'payment',
      'user-profile',
      'subscription',
      'wallet',
      'ad',
      'calendar-event',
      'code-artifact',
      'task',
    ];

    it('should return boolean for every role x action x resource combination', () => {
      for (const role of roles) {
        const subject: PermissionSubject = { userId: `test-${role}`, roles: [role] };
        for (const action of actions) {
          for (const resourceType of resourceTypes) {
            const result = engine.can(subject, action, resourceType);
            expect(typeof result).toBe('boolean');
          }
        }
      }
    });

    it('ADMIN can perform all standard actions on emails', () => {
      const subject: PermissionSubject = { userId: 'admin-1', roles: ['ADMIN'] };
      expect(engine.can(subject, 'read', 'email')).toBe(true);
      expect(engine.can(subject, 'write', 'email')).toBe(true);
      expect(engine.can(subject, 'delete', 'email')).toBe(true);
      expect(engine.can(subject, 'share', 'email')).toBe(true);
      expect(engine.can(subject, 'agent-act', 'email')).toBe(true);
    });

    it('USER can read but not delete videos', () => {
      const subject: PermissionSubject = { userId: 'user-1', roles: ['USER'] };
      expect(engine.can(subject, 'read', 'video')).toBe(true);
      expect(engine.can(subject, 'delete', 'video')).toBe(false);
      expect(engine.can(subject, 'write', 'video')).toBe(false);
    });

    it('CREATOR can monetize posts and videos', () => {
      const subject: PermissionSubject = { userId: 'creator-1', roles: ['CREATOR'] };
      expect(engine.can(subject, 'monetize', 'post')).toBe(true);
      expect(engine.can(subject, 'monetize', 'video')).toBe(true);
      expect(engine.can(subject, 'monetize', 'doc')).toBe(true);
    });

    it('ADVERTISER can write campaigns and ads but not posts', () => {
      const subject: PermissionSubject = { userId: 'adv-1', roles: ['ADVERTISER'] };
      expect(engine.can(subject, 'write', 'campaign')).toBe(true);
      expect(engine.can(subject, 'write', 'ad')).toBe(true);
      expect(engine.can(subject, 'write', 'post')).toBe(false);
    });

    it('MODERATOR can delete posts and messages but cannot monetize', () => {
      const subject: PermissionSubject = { userId: 'mod-1', roles: ['MODERATOR'] };
      expect(engine.can(subject, 'delete', 'post')).toBe(true);
      expect(engine.can(subject, 'delete', 'message')).toBe(true);
      expect(engine.can(subject, 'monetize', 'post')).toBe(false);
      expect(engine.can(subject, 'monetize', 'video')).toBe(false);
    });
  });

  describe('AGENT role special permissions', () => {
    it('AGENT has agent-act permission on supported resource types', () => {
      const subject: PermissionSubject = { userId: 'agent-1', roles: ['AGENT'] };
      expect(engine.can(subject, 'agent-act', 'email')).toBe(true);
      expect(engine.can(subject, 'agent-act', 'message')).toBe(true);
      expect(engine.can(subject, 'agent-act', 'post')).toBe(true);
      expect(engine.can(subject, 'agent-act', 'doc')).toBe(true);
      expect(engine.can(subject, 'agent-act', 'file')).toBe(true);
    });

    it('AGENT does not have delete permission', () => {
      const subject: PermissionSubject = { userId: 'agent-1', roles: ['AGENT'] };
      expect(engine.can(subject, 'delete', 'email')).toBe(false);
      expect(engine.can(subject, 'delete', 'message')).toBe(false);
      expect(engine.can(subject, 'delete', 'post')).toBe(false);
      expect(engine.can(subject, 'delete', 'file')).toBe(false);
    });

    it('AGENT does not have monetize permission', () => {
      const subject: PermissionSubject = { userId: 'agent-1', roles: ['AGENT'] };
      expect(engine.can(subject, 'monetize', 'post')).toBe(false);
      expect(engine.can(subject, 'monetize', 'video')).toBe(false);
      expect(engine.can(subject, 'monetize', 'campaign')).toBe(false);
    });

    it('AGENT cannot agent-act on payment resources', () => {
      const subject: PermissionSubject = { userId: 'agent-1', roles: ['AGENT'] };
      expect(engine.can(subject, 'agent-act', 'payment')).toBe(false);
    });
  });
});

describe('Phase 24 Gates: Consent Withdrawal Immediate Effect', () => {
  let consentManager: ConsentManager;

  beforeEach(() => {
    consentManager = new ConsentManager();
  });

  describe('consent ledger immediate withdrawal', () => {
    it('should have consent active after granting', () => {
      const consentId = consentManager.grantConsent('user-1', 'ai:training', 'quantai', undefined);
      expect(consentManager.isConsentValid(consentId)).toBe(true);
    });

    it('should immediately reflect withdrawal in subsequent checks', () => {
      // Grant consent
      const consentId = consentManager.grantConsent('user-1', 'ai:training', 'quantai', undefined);

      // Verify consent is active
      expect(consentManager.isConsentValid(consentId)).toBe(true);
      const activeBefore = consentManager.getActiveConsentsForUser('user-1');
      expect(activeBefore.length).toBe(1);

      // Withdraw consent
      const withdrawn = consentManager.withdrawConsent(consentId);
      expect(withdrawn).toBe(true);

      // Verify consent is immediately inactive
      expect(consentManager.isConsentValid(consentId)).toBe(false);
      const activeAfter = consentManager.getActiveConsentsForUser('user-1');
      expect(activeAfter.length).toBe(0);
    });

    it('should handle multiple consents with selective withdrawal', () => {
      const consent1 = consentManager.grantConsent('user-1', 'ai:training', 'quantai');
      const consent2 = consentManager.grantConsent('user-1', 'data:analytics', 'quantads');
      const consent3 = consentManager.grantConsent('user-1', 'email:marketing', 'quantmail');

      expect(consentManager.getActiveConsentsForUser('user-1')).toHaveLength(3);

      // Withdraw only one
      consentManager.withdrawConsent(consent2);

      const active = consentManager.getActiveConsentsForUser('user-1');
      expect(active).toHaveLength(2);
      expect(consentManager.isConsentValid(consent1)).toBe(true);
      expect(consentManager.isConsentValid(consent2)).toBe(false);
      expect(consentManager.isConsentValid(consent3)).toBe(true);
    });

    it('should not allow double withdrawal', () => {
      const consentId = consentManager.grantConsent('user-1', 'ai:training', 'quantai');
      consentManager.withdrawConsent(consentId);

      // Second withdrawal should return false
      const result = consentManager.withdrawConsent(consentId);
      expect(result).toBe(false);
    });
  });

  describe('consent with agent-based hasConsent', () => {
    it('should reflect consent grant via requestConsent + recordResponse flow', () => {
      // Request consent
      const promptId = consentManager.requestConsent('user-1', 'agent-ai', 'doc', 'Need access');

      // Before granting, hasConsent should be false
      expect(consentManager.hasConsent('user-1', 'agent-ai', 'doc')).toBe(false);

      // Record positive response
      consentManager.recordResponse(promptId, 'user-1', true);

      // Now hasConsent should be true
      expect(consentManager.hasConsent('user-1', 'agent-ai', 'doc')).toBe(true);

      // Revoke the consent
      consentManager.revokeConsent(promptId);

      // Immediately, hasConsent should be false
      expect(consentManager.hasConsent('user-1', 'agent-ai', 'doc')).toBe(false);
    });
  });
});
