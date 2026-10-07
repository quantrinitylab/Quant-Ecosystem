import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DataRetentionPolicy } from '../data-retention';

describe('DataRetentionPolicy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should evaluate records against retention rules', () => {
    const now = Date.now();
    const policy = new DataRetentionPolicy([
      { entityType: 'session', retentionDays: 30, strategy: 'hard-delete' },
      { entityType: 'audit-log', retentionDays: 90, strategy: 'archive' },
    ]);

    const records = [
      { id: '1', entityType: 'session', createdAt: now - 31 * 24 * 60 * 60 * 1000 },
      { id: '2', entityType: 'session', createdAt: now - 10 * 24 * 60 * 60 * 1000 },
      { id: '3', entityType: 'audit-log', createdAt: now - 100 * 24 * 60 * 60 * 1000 },
      { id: '4', entityType: 'audit-log', createdAt: now - 50 * 24 * 60 * 60 * 1000 },
      { id: '5', entityType: 'unknown', createdAt: now - 365 * 24 * 60 * 60 * 1000 },
    ];

    const result = policy.evaluate(records);

    expect(result.toDelete).toHaveLength(1);
    expect(result.toDelete[0]!.id).toBe('1');
    expect(result.toArchive).toHaveLength(1);
    expect(result.toArchive[0]!.id).toBe('3');
    expect(result.toSoftDelete).toHaveLength(0);
    expect(result.retained).toBe(3);
  });

  it('should retain all records when no rules match', () => {
    const policy = new DataRetentionPolicy([]);
    const now = Date.now();

    const records = [{ id: '1', entityType: 'user', createdAt: now - 1000 * 24 * 60 * 60 * 1000 }];

    const result = policy.evaluate(records);
    expect(result.toArchive).toHaveLength(0);
    expect(result.toDelete).toHaveLength(0);
    expect(result.toSoftDelete).toHaveLength(0);
    expect(result.retained).toBe(1);
  });

  it('should route soft-delete strategy to toSoftDelete (not toDelete)', () => {
    const now = Date.now();
    const policy = new DataRetentionPolicy([
      { entityType: 'temp', retentionDays: 1, strategy: 'soft-delete' },
    ]);

    const records = [{ id: '1', entityType: 'temp', createdAt: now - 2 * 24 * 60 * 60 * 1000 }];

    const result = policy.evaluate(records);
    expect(result.toSoftDelete).toHaveLength(1);
    expect(result.toSoftDelete[0]!.id).toBe('1');
    expect(result.toDelete).toHaveLength(0);
    expect(result.toArchive).toHaveLength(0);
  });

  it('should distinguish soft-delete, hard-delete, and archive in same evaluation', () => {
    const now = Date.now();
    const policy = new DataRetentionPolicy([
      { entityType: 'session', retentionDays: 7, strategy: 'hard-delete' },
      { entityType: 'comment', retentionDays: 30, strategy: 'soft-delete' },
      { entityType: 'audit', retentionDays: 90, strategy: 'archive' },
    ]);

    const records = [
      { id: '1', entityType: 'session', createdAt: now - 10 * 24 * 60 * 60 * 1000 },
      { id: '2', entityType: 'comment', createdAt: now - 60 * 24 * 60 * 60 * 1000 },
      { id: '3', entityType: 'audit', createdAt: now - 120 * 24 * 60 * 60 * 1000 },
      { id: '4', entityType: 'session', createdAt: now - 3 * 24 * 60 * 60 * 1000 }, // retained
    ];

    const result = policy.evaluate(records);
    expect(result.toDelete).toHaveLength(1);
    expect(result.toDelete[0]!.id).toBe('1');
    expect(result.toSoftDelete).toHaveLength(1);
    expect(result.toSoftDelete[0]!.id).toBe('2');
    expect(result.toArchive).toHaveLength(1);
    expect(result.toArchive[0]!.id).toBe('3');
    expect(result.retained).toBe(1);
  });

  it('should add a rule dynamically', () => {
    const policy = new DataRetentionPolicy([]);
    policy.addRule({ entityType: 'logs', retentionDays: 7, strategy: 'hard-delete' });

    const rules = policy.getRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.entityType).toBe('logs');
  });

  it('should remove a rule', () => {
    const policy = new DataRetentionPolicy([
      { entityType: 'logs', retentionDays: 7, strategy: 'hard-delete' },
    ]);

    const removed = policy.removeRule('logs');
    expect(removed).toBe(true);
    expect(policy.getRules()).toHaveLength(0);
  });

  it('should return false when removing nonexistent rule', () => {
    const policy = new DataRetentionPolicy([]);
    expect(policy.removeRule('nonexistent')).toBe(false);
  });

  it('should create an archive batch', () => {
    const policy = new DataRetentionPolicy([]);
    const records = [
      { id: '1', entityType: 'audit-log', data: { action: 'login' } },
      { id: '2', entityType: 'audit-log', data: { action: 'logout' } },
    ];

    const batch = policy.createArchiveBatch(records);

    expect(batch.batchId).toBeDefined();
    expect(batch.records).toHaveLength(2);
    expect(batch.createdAt).toBeTypeOf('number');
    expect(batch.records[0]!.data).toEqual({ action: 'login' });
  });

  it('should generate unique batch ids', () => {
    const policy = new DataRetentionPolicy([]);

    const batch1 = policy.createArchiveBatch([]);
    const batch2 = policy.createArchiveBatch([]);

    expect(batch1.batchId).not.toBe(batch2.batchId);
  });

  it('should override rule for same entity type', () => {
    const policy = new DataRetentionPolicy([
      { entityType: 'logs', retentionDays: 7, strategy: 'hard-delete' },
    ]);

    policy.addRule({ entityType: 'logs', retentionDays: 30, strategy: 'archive' });

    const rules = policy.getRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.retentionDays).toBe(30);
    expect(rules[0]!.strategy).toBe('archive');
  });
});
