import { describe, it, expect } from 'vitest';
import { AuditLogger } from './audit-logger';
import type { AuditActor } from '../types';

const actor: AuditActor = { id: 'user-1', type: 'user', name: 'Alice' };

async function seed(logger: AuditLogger, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await logger.log({
      actor,
      action: 'login',
      resource: 'session',
      resourceId: `s${i}`,
      outcome: 'success',
    });
  }
}

describe('AuditLogger tamper-evident chain (real SHA-256)', () => {
  it('produces 64-char SHA-256 hex hashes that chain correctly', async () => {
    const logger = new AuditLogger();
    const entry = await logger.log({
      actor,
      action: 'create',
      resource: 'doc',
      resourceId: 'd1',
      outcome: 'success',
    });

    expect(entry.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(entry.previousHash).toBe('0'.repeat(64));
  });

  it('verifyIntegrity passes for an untampered chain', async () => {
    const logger = new AuditLogger();
    await seed(logger, 5);
    const result = logger.verifyIntegrity();
    expect(result.valid).toBe(true);
  });

  it('detects tampering when an entry field is mutated', async () => {
    const logger = new AuditLogger();
    await seed(logger, 5);

    // Tamper with the internal entry content; the recomputed SHA-256 will no longer match.
    const entries = logger.getRecent(5);
    const target = entries[2]!;
    (target as { action: string }).action = 'DELETED_EVERYTHING';

    const result = logger.verifyIntegrity();
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(2);
  });
});
