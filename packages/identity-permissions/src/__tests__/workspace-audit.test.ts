import { describe, it, expect, beforeEach } from 'vitest';
import { WorkspaceAuditLog } from '../core/workspace-audit.js';

describe('WorkspaceAuditLog', () => {
  let audit: WorkspaceAuditLog;

  beforeEach(() => {
    audit = new WorkspaceAuditLog();
  });

  describe('logEvent', () => {
    it('logs an event', () => {
      audit.logEvent('ws-1', 'user-1', 'user', 'create', 'res-1', { detail: 'test' });
      expect(audit.getEventCount('ws-1')).toBe(1);
    });

    it('logs multiple events', () => {
      audit.logEvent('ws-1', 'user-1', 'user', 'create');
      audit.logEvent('ws-1', 'agent-1', 'agent', 'read');
      expect(audit.getEventCount('ws-1')).toBe(2);
    });
  });

  describe('getEvents', () => {
    it('returns events for a workspace', () => {
      audit.logEvent('ws-1', 'user-1', 'user', 'create');
      audit.logEvent('ws-2', 'user-2', 'user', 'read');

      const events = audit.getEvents('ws-1');
      expect(events).toHaveLength(1);
    });

    it('filters by actorId', () => {
      audit.logEvent('ws-1', 'user-1', 'user', 'create');
      audit.logEvent('ws-1', 'user-2', 'user', 'read');

      const events = audit.getEvents('ws-1', { actorId: 'user-1' });
      expect(events).toHaveLength(1);
    });

    it('filters by action', () => {
      audit.logEvent('ws-1', 'user-1', 'user', 'create');
      audit.logEvent('ws-1', 'user-1', 'user', 'delete');

      const events = audit.getEvents('ws-1', { action: 'create' });
      expect(events).toHaveLength(1);
    });

    it('filters by time range', () => {
      const before = Date.now() - 1000;
      audit.logEvent('ws-1', 'user-1', 'user', 'create');
      const after = Date.now() + 1000;

      const events = audit.getEvents('ws-1', { from: before, to: after });
      expect(events).toHaveLength(1);

      const noEvents = audit.getEvents('ws-1', { from: after });
      expect(noEvents).toHaveLength(0);
    });
  });

  describe('exportEvents', () => {
    it('exports as JSON', () => {
      audit.logEvent('ws-1', 'user-1', 'user', 'create');
      const json = audit.exportEvents('ws-1', 'json');
      const parsed = JSON.parse(json) as unknown[];
      expect(parsed).toHaveLength(1);
    });

    it('exports as CSV', () => {
      audit.logEvent('ws-1', 'user-1', 'user', 'create', 'res-1');
      const csv = audit.exportEvents('ws-1', 'csv');
      expect(csv).toContain('id,workspaceId,actorId,actorType,action,resourceId,timestamp');
      expect(csv).toContain('ws-1');
      expect(csv).toContain('user-1');
    });

    it('exports empty string for no events in CSV', () => {
      const csv = audit.exportEvents('ws-empty', 'csv');
      expect(csv).toBe('');
    });
  });

  describe('getEventCount', () => {
    it('returns 0 for unknown workspace', () => {
      expect(audit.getEventCount('unknown')).toBe(0);
    });
  });
});
