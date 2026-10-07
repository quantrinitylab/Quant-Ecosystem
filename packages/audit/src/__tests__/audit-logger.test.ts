import { describe, it, expect, beforeEach } from 'vitest';
import { AuditLogger } from '../audit-logger';
import { AuditAction } from '../types';

describe('AuditLogger', () => {
  let logger: AuditLogger;

  beforeEach(() => {
    logger = new AuditLogger();
  });

  it('log creates event with id and timestamp', () => {
    const event = logger.log({
      userId: 'user-1',
      action: AuditAction.LOGIN,
      resource: 'auth',
    });

    expect(event.id).toBeDefined();
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(event.userId).toBe('user-1');
    expect(event.action).toBe(AuditAction.LOGIN);
    expect(event.resource).toBe('auth');
  });

  it('query filters by action', () => {
    logger.log({ userId: 'user-1', action: AuditAction.LOGIN, resource: 'auth' });
    logger.log({ userId: 'user-1', action: AuditAction.DATA_ACCESS, resource: 'files' });
    logger.log({ userId: 'user-2', action: AuditAction.LOGIN, resource: 'auth' });

    const results = logger.query({ action: AuditAction.LOGIN });
    expect(results).toHaveLength(2);
    expect(results.every((e) => e.action === AuditAction.LOGIN)).toBe(true);
  });

  it('query filters by date range', () => {
    const event1 = logger.log({
      userId: 'user-1',
      action: AuditAction.LOGIN,
      resource: 'auth',
    });

    // Manually adjust timestamp for testing
    const pastDate = new Date('2020-01-01');
    (event1 as { timestamp: Date }).timestamp = pastDate;

    logger.log({ userId: 'user-1', action: AuditAction.LOGOUT, resource: 'auth' });

    const results = logger.query({
      startDate: new Date('2024-01-01'),
    });

    expect(results).toHaveLength(1);
    expect(results[0].action).toBe(AuditAction.LOGOUT);
  });

  it('query applies limit/offset', () => {
    for (let i = 0; i < 10; i++) {
      logger.log({ userId: 'user-1', action: AuditAction.DATA_ACCESS, resource: `res-${i}` });
    }

    const page1 = logger.query({ limit: 3, offset: 0 });
    expect(page1).toHaveLength(3);

    const page2 = logger.query({ limit: 3, offset: 3 });
    expect(page2).toHaveLength(3);
    expect(page2[0].resource).toBe('res-3');
  });

  it('getByUser returns user events', () => {
    logger.log({ userId: 'user-1', action: AuditAction.LOGIN, resource: 'auth' });
    logger.log({ userId: 'user-2', action: AuditAction.LOGIN, resource: 'auth' });
    logger.log({ userId: 'user-1', action: AuditAction.LOGOUT, resource: 'auth' });

    const events = logger.getByUser('user-1');
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.userId === 'user-1')).toBe(true);
  });

  it('count returns correct count', () => {
    logger.log({ userId: 'user-1', action: AuditAction.LOGIN, resource: 'auth' });
    logger.log({ userId: 'user-2', action: AuditAction.LOGIN, resource: 'auth' });
    logger.log({ userId: 'user-1', action: AuditAction.DATA_ACCESS, resource: 'files' });

    expect(logger.count()).toBe(3);
    expect(logger.count({ userId: 'user-1' })).toBe(2);
    expect(logger.count({ action: AuditAction.LOGIN })).toBe(2);
  });
});
