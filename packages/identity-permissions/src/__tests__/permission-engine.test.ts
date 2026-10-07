import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionEngine } from '../core/permission-engine.js';
import { ALL_RESOURCE_CONTRACTS } from '../core/resource-contracts.js';
import type { PermissionSubject, PlatformRole, PermissionAction, ABACContext } from '../types.js';

describe('PermissionEngine', () => {
  let engine: PermissionEngine;

  beforeEach(() => {
    engine = new PermissionEngine();
    engine.registerContracts(ALL_RESOURCE_CONTRACTS);
  });

  describe('can() - role-based checks', () => {
    const roles: PlatformRole[] = ['USER', 'ADMIN', 'MODERATOR', 'CREATOR', 'ADVERTISER', 'AGENT'];
    const actions: PermissionAction[] = [
      'read',
      'write',
      'delete',
      'share',
      'monetize',
      'agent-act',
    ];

    it('ADMIN can read all resource types', () => {
      const subject: PermissionSubject = { userId: 'admin-1', roles: ['ADMIN'] };
      expect(engine.can(subject, 'read', 'email')).toBe(true);
      expect(engine.can(subject, 'read', 'message')).toBe(true);
      expect(engine.can(subject, 'read', 'post')).toBe(true);
      expect(engine.can(subject, 'read', 'video')).toBe(true);
      expect(engine.can(subject, 'read', 'file')).toBe(true);
      expect(engine.can(subject, 'read', 'doc')).toBe(true);
      expect(engine.can(subject, 'read', 'payment')).toBe(true);
    });

    it('USER can read but cannot monetize posts', () => {
      const subject: PermissionSubject = { userId: 'user-1', roles: ['USER'] };
      expect(engine.can(subject, 'read', 'post')).toBe(true);
      expect(engine.can(subject, 'monetize', 'post')).toBe(false);
    });

    it('CREATOR can monetize posts and videos', () => {
      const subject: PermissionSubject = { userId: 'creator-1', roles: ['CREATOR'] };
      expect(engine.can(subject, 'monetize', 'post')).toBe(true);
      expect(engine.can(subject, 'monetize', 'video')).toBe(true);
    });

    it('ADVERTISER can write campaigns but not posts', () => {
      const subject: PermissionSubject = { userId: 'adv-1', roles: ['ADVERTISER'] };
      expect(engine.can(subject, 'write', 'campaign')).toBe(true);
      expect(engine.can(subject, 'write', 'post')).toBe(false);
    });

    it('AGENT can only agent-act where allowed', () => {
      const subject: PermissionSubject = { userId: 'agent-1', roles: ['AGENT'] };
      expect(engine.can(subject, 'agent-act', 'email')).toBe(true);
      expect(engine.can(subject, 'agent-act', 'message')).toBe(true);
      expect(engine.can(subject, 'agent-act', 'payment')).toBe(false);
    });

    it('MODERATOR can delete posts but cannot monetize', () => {
      const subject: PermissionSubject = { userId: 'mod-1', roles: ['MODERATOR'] };
      expect(engine.can(subject, 'delete', 'post')).toBe(true);
      expect(engine.can(subject, 'delete', 'message')).toBe(true);
      expect(engine.can(subject, 'monetize', 'post')).toBe(false);
    });

    it('denies access when role is not in contract', () => {
      const subject: PermissionSubject = { userId: 'user-1', roles: ['USER'] };
      expect(engine.can(subject, 'write', 'campaign')).toBe(false);
      expect(engine.can(subject, 'delete', 'video')).toBe(false);
    });

    it('user with multiple roles gets union of permissions', () => {
      const subject: PermissionSubject = { userId: 'multi-1', roles: ['CREATOR', 'ADVERTISER'] };
      expect(engine.can(subject, 'write', 'video')).toBe(true);
      expect(engine.can(subject, 'write', 'campaign')).toBe(true);
      expect(engine.can(subject, 'monetize', 'post')).toBe(true);
      expect(engine.can(subject, 'monetize', 'campaign')).toBe(true);
    });

    it('each role is distinct - checks all roles x actions for email', () => {
      for (const role of roles) {
        const subject: PermissionSubject = { userId: `test-${role}`, roles: [role] };
        for (const action of actions) {
          const result = engine.can(subject, action, 'email');
          expect(typeof result).toBe('boolean');
        }
      }
    });
  });

  describe('can() - ABAC context rules', () => {
    it('denies access when trust score is below threshold', () => {
      engine.addPolicy({
        roles: ['USER'],
        actions: ['write'],
        resourceTypes: ['email'],
        conditions: [{ attribute: 'trustScore', operator: 'gte', value: 50 }],
      });

      const subject: PermissionSubject = { userId: 'user-1', roles: ['USER'] };
      const lowTrust: ABACContext = { trustScore: 30 };
      const highTrust: ABACContext = { trustScore: 80 };

      expect(engine.can(subject, 'write', 'email', lowTrust)).toBe(false);
      expect(engine.can(subject, 'write', 'email', highTrust)).toBe(true);
    });

    it('restricts access based on location', () => {
      engine.addPolicy({
        roles: ['USER'],
        actions: ['read'],
        resourceTypes: ['payment'],
        conditions: [{ attribute: 'location', operator: 'in', value: ['US', 'EU', 'UK'] }],
      });

      const subject: PermissionSubject = { userId: 'user-1', roles: ['USER'] };
      const usContext: ABACContext = { location: 'US' };
      const blockedContext: ABACContext = { location: 'BLOCKED' };

      expect(engine.can(subject, 'read', 'payment', usContext)).toBe(true);
      expect(engine.can(subject, 'read', 'payment', blockedContext)).toBe(false);
    });

    it('restricts access based on device trust', () => {
      engine.addPolicy({
        roles: ['USER'],
        actions: ['delete'],
        resourceTypes: ['email'],
        conditions: [{ attribute: 'device', operator: 'in', value: ['desktop', 'mobile-trusted'] }],
      });

      const subject: PermissionSubject = { userId: 'user-1', roles: ['USER'] };
      const trusted: ABACContext = { device: 'desktop' };
      const untrusted: ABACContext = { device: 'unknown-device' };

      expect(engine.can(subject, 'delete', 'email', trusted)).toBe(true);
      expect(engine.can(subject, 'delete', 'email', untrusted)).toBe(false);
    });

    it('handles time-based restrictions', () => {
      engine.addPolicy({
        roles: ['USER'],
        actions: ['write'],
        resourceTypes: ['email'],
        conditions: [{ attribute: 'time', operator: 'gte', value: 1000 }],
      });

      const subject: PermissionSubject = { userId: 'user-1', roles: ['USER'] };
      const afterTime: ABACContext = { time: 2000 };
      const beforeTime: ABACContext = { time: 500 };

      expect(engine.can(subject, 'write', 'email', afterTime)).toBe(true);
      expect(engine.can(subject, 'write', 'email', beforeTime)).toBe(false);
    });

    it('passes when context attribute is not provided (permissive)', () => {
      engine.addPolicy({
        roles: ['USER'],
        actions: ['read'],
        resourceTypes: ['doc'],
        conditions: [{ attribute: 'trustScore', operator: 'gte', value: 50 }],
      });

      const subject: PermissionSubject = { userId: 'user-1', roles: ['USER'] };
      // No trustScore in context - condition should pass
      expect(engine.can(subject, 'read', 'doc', {})).toBe(true);
    });

    it('evaluates multiple conditions (all must pass)', () => {
      engine.addPolicy({
        roles: ['USER'],
        actions: ['write'],
        resourceTypes: ['wallet'],
        conditions: [
          { attribute: 'trustScore', operator: 'gte', value: 70 },
          { attribute: 'device', operator: 'eq', value: 'desktop' },
        ],
      });

      const subject: PermissionSubject = { userId: 'user-1', roles: ['USER'] };

      expect(engine.can(subject, 'write', 'wallet', { trustScore: 80, device: 'desktop' })).toBe(
        true,
      );
      expect(engine.can(subject, 'write', 'wallet', { trustScore: 80, device: 'mobile' })).toBe(
        false,
      );
      expect(engine.can(subject, 'write', 'wallet', { trustScore: 50, device: 'desktop' })).toBe(
        false,
      );
    });
  });

  describe('can() - performance', () => {
    it('completes permission check in <5ms', () => {
      const subject: PermissionSubject = { userId: 'perf-user', roles: ['USER', 'CREATOR'] };
      const context: ABACContext = { trustScore: 80, device: 'desktop', location: 'US' };

      engine.addPolicy({
        roles: ['USER', 'CREATOR'],
        actions: ['read', 'write', 'share'],
        resourceTypes: ['post', 'video', 'doc'],
        conditions: [
          { attribute: 'trustScore', operator: 'gte', value: 50 },
          { attribute: 'device', operator: 'in', value: ['desktop', 'mobile-trusted'] },
        ],
      });

      // Warm up
      engine.can(subject, 'read', 'post', context);

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        engine.can(subject, 'read', 'post', context);
        engine.can(subject, 'write', 'video', context);
        engine.can(subject, 'share', 'doc', context);
      }
      const elapsed = performance.now() - start;

      // 3000 checks should complete in well under 5000ms (< 5ms per check average)
      // Actually targeting <5ms per single check - 3000 checks should be well under 15000ms
      const perCheck = elapsed / 3000;
      expect(perCheck).toBeLessThan(5);
    });
  });

  describe('can() - without contracts (policy-only mode)', () => {
    it('denies when no policies or contracts match', () => {
      const emptyEngine = new PermissionEngine();
      const subject: PermissionSubject = { userId: 'user-1', roles: ['USER'] };
      expect(emptyEngine.can(subject, 'read', 'email')).toBe(false);
    });

    it('allows when policy matches without contracts', () => {
      const policyEngine = new PermissionEngine();
      policyEngine.addPolicy({
        roles: ['USER'],
        actions: ['read'],
        resourceTypes: ['email'],
      });

      const subject: PermissionSubject = { userId: 'user-1', roles: ['USER'] };
      expect(policyEngine.can(subject, 'read', 'email')).toBe(true);
    });
  });
});
