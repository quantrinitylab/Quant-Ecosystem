import { describe, it, expect, beforeEach } from 'vitest';
import { TransactionLedger } from '../coins/transaction-ledger.js';

describe('TransactionLedger', () => {
  let ledger: TransactionLedger;

  beforeEach(() => {
    ledger = new TransactionLedger();
  });

  it('should record a ledger entry', () => {
    const entry = ledger.record({
      userId: 'user-1',
      amount: 100,
      direction: 'credit',
      reason: 'test',
      idempotencyKey: 'key-1',
    });
    expect(entry).not.toBeNull();
    expect(entry!.id).toBeDefined();
    expect(entry!.userId).toBe('user-1');
    expect(entry!.amount).toBe(100);
  });

  it('should deduplicate by idempotency key', () => {
    ledger.record({
      userId: 'user-1',
      amount: 100,
      direction: 'credit',
      reason: 'first',
      idempotencyKey: 'key-dup',
    });
    const dup = ledger.record({
      userId: 'user-1',
      amount: 200,
      direction: 'credit',
      reason: 'second',
      idempotencyKey: 'key-dup',
    });
    expect(dup).toBeNull();
    expect(ledger.getAll()).toHaveLength(1);
  });

  it('should get entries by user', () => {
    ledger.record({
      userId: 'user-1',
      amount: 50,
      direction: 'credit',
      reason: 'a',
      idempotencyKey: 'k1',
    });
    ledger.record({
      userId: 'user-2',
      amount: 30,
      direction: 'debit',
      reason: 'b',
      idempotencyKey: 'k2',
    });
    ledger.record({
      userId: 'user-1',
      amount: 20,
      direction: 'debit',
      reason: 'c',
      idempotencyKey: 'k3',
    });

    const user1Entries = ledger.getByUser('user-1');
    expect(user1Entries).toHaveLength(2);
    expect(user1Entries[0]?.amount).toBe(50);
  });

  it('should get entry by idempotency key', () => {
    ledger.record({
      userId: 'user-1',
      amount: 75,
      direction: 'credit',
      reason: 'lookup',
      idempotencyKey: 'find-me',
    });
    const found = ledger.getByKey('find-me');
    expect(found).toBeDefined();
    expect(found!.amount).toBe(75);
  });

  it('should maintain integrity across multiple operations', () => {
    for (let i = 0; i < 10; i++) {
      ledger.record({
        userId: `user-${i % 3}`,
        amount: (i + 1) * 10,
        direction: i % 2 === 0 ? 'credit' : 'debit',
        reason: `op-${i}`,
        idempotencyKey: `key-${i}`,
      });
    }
    expect(ledger.getAll()).toHaveLength(10);
    expect(ledger.getByUser('user-0')).toHaveLength(4);
  });
});
