import { describe, it, expect, beforeEach } from 'vitest';
import { SafetyAuditLogService } from './safety-audit-log';

describe('SafetyAuditLogService', () => {
  let service: SafetyAuditLogService;

  beforeEach(() => {
    service = new SafetyAuditLogService();
  });

  describe('record', () => {
    it('should create an audit entry with all fields', () => {
      const entry = service.record({
        eventType: 'content_flagged',
        actor: 'system',
        targetUserId: 'user-1',
        targetContentId: 'post-1',
        action: 'flag',
        reason: 'Automated detection',
        metadata: { score: 0.95 },
      });

      expect(entry.id).toMatch(/^audit_/);
      expect(entry.eventType).toBe('content_flagged');
      expect(entry.actor).toBe('system');
      expect(entry.targetUserId).toBe('user-1');
      expect(entry.targetContentId).toBe('post-1');
      expect(entry.action).toBe('flag');
      expect(entry.reason).toBe('Automated detection');
      expect(entry.metadata).toEqual({ score: 0.95 });
      expect(entry.timestamp).toBeDefined();
    });

    it('should create entry without optional fields', () => {
      const entry = service.record({
        eventType: 'policy_changed',
        actor: 'admin-1',
        action: 'update_policy',
        reason: 'Quarterly review',
      });

      expect(entry.targetUserId).toBeUndefined();
      expect(entry.targetContentId).toBeUndefined();
    });

    it('should generate unique IDs', () => {
      const e1 = service.record({
        eventType: 'user_warned',
        actor: 'mod-1',
        action: 'warn',
        reason: 'First offense',
      });
      const e2 = service.record({
        eventType: 'user_warned',
        actor: 'mod-1',
        action: 'warn',
        reason: 'Second offense',
      });
      expect(e1.id).not.toBe(e2.id);
    });
  });

  describe('immutability', () => {
    it('should freeze entries after creation', () => {
      const entry = service.record({
        eventType: 'content_removed',
        actor: 'mod-1',
        action: 'remove',
        reason: 'Violation',
      });

      expect(() => {
        (entry as any).reason = 'modified';
      }).toThrow();
    });

    it('should freeze metadata', () => {
      const entry = service.record({
        eventType: 'user_banned',
        actor: 'admin',
        action: 'ban',
        reason: 'Repeated violations',
        metadata: { count: 5 },
      });

      expect(() => {
        (entry.metadata as any).count = 10;
      }).toThrow();
    });
  });

  describe('getEntry', () => {
    it('should retrieve entry by ID', () => {
      const created = service.record({
        eventType: 'appeal_submitted',
        actor: 'user-1',
        action: 'submit_appeal',
        reason: 'Unfair removal',
      });

      const retrieved = service.getEntry(created.id);
      expect(retrieved).toEqual(created);
    });

    it('should return undefined for unknown ID', () => {
      expect(service.getEntry('nonexistent')).toBeUndefined();
    });
  });

  describe('query', () => {
    beforeEach(() => {
      service.record({
        eventType: 'content_flagged',
        actor: 'system',
        targetUserId: 'user-1',
        action: 'flag',
        reason: 'Auto-detected',
      });
      service.record({
        eventType: 'content_removed',
        actor: 'mod-1',
        targetUserId: 'user-1',
        action: 'remove',
        reason: 'Manual review',
      });
      service.record({
        eventType: 'user_warned',
        actor: 'mod-2',
        targetUserId: 'user-2',
        action: 'warn',
        reason: 'First warning',
      });
    });

    it('should return all entries without filters', () => {
      const results = service.query();
      expect(results.length).toBe(3);
    });

    it('should filter by eventType', () => {
      const results = service.query({ eventType: 'content_flagged' });
      expect(results.length).toBe(1);
      expect(results[0]!.eventType).toBe('content_flagged');
    });

    it('should filter by actor', () => {
      const results = service.query({ actor: 'mod-1' });
      expect(results.length).toBe(1);
      expect(results[0]!.actor).toBe('mod-1');
    });

    it('should filter by targetUserId', () => {
      const results = service.query({ targetUserId: 'user-1' });
      expect(results.length).toBe(2);
    });

    it('should filter by date range', () => {
      const before = Date.now() - 5000;
      const after = Date.now() + 5000;
      const results = service.query({ startDate: before, endDate: after });
      expect(results.length).toBe(3);
    });

    it('should respect limit', () => {
      const results = service.query({ limit: 2 });
      expect(results.length).toBe(2);
    });
  });

  describe('getStats', () => {
    it('should return counts by event type', () => {
      const now = Date.now();
      service.record({
        eventType: 'content_flagged',
        actor: 'sys',
        action: 'flag',
        reason: 'test',
      });
      service.record({
        eventType: 'content_flagged',
        actor: 'sys',
        action: 'flag',
        reason: 'test',
      });
      service.record({
        eventType: 'user_banned',
        actor: 'admin',
        action: 'ban',
        reason: 'test',
      });

      const stats = service.getStats(now - 1000, now + 5000);
      expect(stats['content_flagged']).toBe(2);
      expect(stats['user_banned']).toBe(1);
    });

    it('should respect date range in stats', () => {
      const future = Date.now() + 100_000;
      const stats = service.getStats(future, future + 1000);
      expect(Object.keys(stats).length).toBe(0);
    });
  });
});
