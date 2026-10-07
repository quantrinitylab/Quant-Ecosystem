import { describe, it, expect, beforeEach } from 'vitest';
import { RetentionManager } from '../retention-policy';
import { AuditLogger } from '../audit-logger';
import { AuditAction } from '../types';

describe('RetentionManager', () => {
  let manager: RetentionManager;
  let logger: AuditLogger;

  beforeEach(() => {
    manager = new RetentionManager();
    logger = new AuditLogger();
  });

  it('addPolicy stores policy', () => {
    manager.addPolicy({ resource: 'auth', maxAgeDays: 30, enabled: true });
    manager.addPolicy({ resource: 'files', maxAgeDays: 90, enabled: true });

    const policies = manager.getPolicies();
    expect(policies).toHaveLength(2);
    expect(policies[0].resource).toBe('auth');
    expect(policies[1].resource).toBe('files');
  });

  it('addPolicy updates existing policy for same resource', () => {
    manager.addPolicy({ resource: 'auth', maxAgeDays: 30, enabled: true });
    manager.addPolicy({ resource: 'auth', maxAgeDays: 60, enabled: false });

    const policies = manager.getPolicies();
    expect(policies).toHaveLength(1);
    expect(policies[0].maxAgeDays).toBe(60);
    expect(policies[0].enabled).toBe(false);
  });

  it('removePolicy removes policy', () => {
    manager.addPolicy({ resource: 'auth', maxAgeDays: 30, enabled: true });
    manager.addPolicy({ resource: 'files', maxAgeDays: 90, enabled: true });

    manager.removePolicy('auth');

    const policies = manager.getPolicies();
    expect(policies).toHaveLength(1);
    expect(policies[0].resource).toBe('files');
  });

  it('applyRetention removes old events', () => {
    // Create events with old timestamps
    const event = logger.log({
      userId: 'user-1',
      action: AuditAction.LOGIN,
      resource: 'auth',
    });
    // Set event timestamp to 60 days ago
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);
    (event as { timestamp: Date }).timestamp = oldDate;

    // Create a recent event
    logger.log({
      userId: 'user-1',
      action: AuditAction.DATA_ACCESS,
      resource: 'auth',
    });

    // Apply retention for 30 days
    manager.addPolicy({ resource: 'auth', maxAgeDays: 30, enabled: true });
    const result = manager.applyRetention(logger);

    expect(result.deletedCount).toBe(1);
    expect(result.resources).toContain('auth');
    expect(logger.count()).toBe(1);
  });

  it('applyRetention skips disabled policies', () => {
    const event = logger.log({
      userId: 'user-1',
      action: AuditAction.LOGIN,
      resource: 'auth',
    });
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);
    (event as { timestamp: Date }).timestamp = oldDate;

    manager.addPolicy({ resource: 'auth', maxAgeDays: 30, enabled: false });
    const result = manager.applyRetention(logger);

    expect(result.deletedCount).toBe(0);
    expect(logger.count()).toBe(1);
  });

  it('getPolicies returns all', () => {
    manager.addPolicy({ resource: 'auth', maxAgeDays: 30, enabled: true });
    manager.addPolicy({ resource: 'files', maxAgeDays: 60, enabled: true });
    manager.addPolicy({ resource: 'settings', maxAgeDays: 90, enabled: false });

    const policies = manager.getPolicies();
    expect(policies).toHaveLength(3);
  });
});
