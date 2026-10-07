import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { MemoryShadowReportRepository } from '../repositories/memory-shadow-report.repository';

const databaseUrl = process.env['MEMORY_SHADOW_TEST_DATABASE_URL'];
const describePostgres = databaseUrl ? describe : describe.skip;

function input(tenantId: string, requestId: string) {
  const observedAt = new Date();
  return {
    tenantId,
    orgId: null,
    actorUserId: tenantId,
    requestId,
    mode: 'shadow',
    query: 'restart proof',
    legacy: { recalled: ['a'], latencyMs: 1 },
    next: { recalled: ['a'], latencyMs: 2 },
    divergence: { onlyLegacy: [], onlyNew: [], agreementRate: 1, severity: 'LOW' },
    severity: 'LOW',
    agreementRate: 1,
    infrastructureError: false,
    commitSha: 'a'.repeat(40),
    policyVersion: 'policy-v1',
    corpusVersion: 'corpus-v1',
    observedAt,
    expiresAt: new Date(observedAt.getTime() + 60_000),
  };
}

describePostgres('MemoryShadowReportRepository PostgreSQL reconstruction', () => {
  let firstClient: PrismaClient;
  const tenantA = `m11d-a-${randomUUID()}`;
  const tenantB = `m11d-b-${randomUUID()}`;
  const requestId = `m11d-${randomUUID()}`;

  beforeAll(async () => {
    firstClient = new PrismaClient({ datasourceUrl: databaseUrl });
    await firstClient.$connect();
  });

  afterAll(async () => {
    await firstClient?.$disconnect();
  });

  it('persists across client reconstruction and keeps tenants isolated', async () => {
    const firstRepository = new MemoryShadowReportRepository(firstClient);
    await firstRepository.create(input(tenantA, requestId));
    await firstRepository.create(input(tenantB, requestId));
    await firstClient.$disconnect();

    const reconstructedClient = new PrismaClient({ datasourceUrl: databaseUrl });
    try {
      await reconstructedClient.$connect();
      const reconstructed = new MemoryShadowReportRepository(reconstructedClient);
      await expect(reconstructed.countForTenant(tenantA)).resolves.toBe(1);
      await expect(reconstructed.countForTenant(tenantB)).resolves.toBe(1);
      await expect(reconstructed.findByRequest(tenantA, requestId)).resolves.toMatchObject({
        tenantId: tenantA,
        actorUserId: tenantA,
      });
      await expect(
        reconstructed.findByRequest(tenantA, `missing-${requestId}`),
      ).resolves.toBeNull();

      const invalidCommit = input(tenantA, `invalid-commit-${randomUUID()}`);
      invalidCommit.commitSha = 'not-a-commit';
      await expect(reconstructed.create(invalidCommit)).rejects.toThrow();

      const invalidExpiry = input(tenantA, `invalid-expiry-${randomUUID()}`);
      invalidExpiry.expiresAt = invalidExpiry.observedAt;
      await expect(reconstructed.create(invalidExpiry)).rejects.toThrow();

      const cleanupAt = new Date(Date.now() + 120_000);
      await expect(reconstructed.deleteExpiredForTenant(tenantA, cleanupAt)).resolves.toBe(1);
      await expect(reconstructed.countForTenant(tenantB)).resolves.toBe(1);
      await expect(reconstructed.deleteExpiredForTenant(tenantB, cleanupAt)).resolves.toBe(1);
    } finally {
      await reconstructedClient.$disconnect();
    }
  });
});
