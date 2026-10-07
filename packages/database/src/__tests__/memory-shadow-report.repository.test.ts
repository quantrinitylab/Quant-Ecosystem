import { describe, expect, it } from 'vitest';
import {
  MemoryShadowReportRepository,
  type CreateMemoryShadowReportInput,
  type MemoryShadowReportDelegate,
  type MemoryShadowReportRow,
} from '../repositories/memory-shadow-report.repository';

function input(
  tenantId: string,
  requestId: string,
  expiresAt: Date,
): CreateMemoryShadowReportInput {
  return {
    tenantId,
    orgId: null,
    actorUserId: tenantId,
    requestId,
    mode: 'shadow',
    query: 'where do I live?',
    legacy: { recalled: ['Patna'], latencyMs: 4 },
    next: { recalled: ['Patna'], latencyMs: 5 },
    divergence: { onlyLegacy: [], onlyNew: [], agreementRate: 1, severity: 'LOW' },
    severity: 'LOW',
    agreementRate: 1,
    infrastructureError: false,
    commitSha: 'a'.repeat(40),
    policyVersion: 'policy-v1',
    corpusVersion: 'corpus-v1',
    observedAt: new Date('2026-07-23T00:00:00.000Z'),
    expiresAt,
  };
}

function sharedDelegate(): MemoryShadowReportDelegate {
  let rows: MemoryShadowReportRow[] = [];
  const matches = (
    row: MemoryShadowReportRow,
    where: Parameters<MemoryShadowReportDelegate['count']>[0]['where'],
  ): boolean =>
    row.tenantId === where.tenantId &&
    (!where.actorUserId || row.actorUserId === where.actorUserId) &&
    (!where.severity || row.severity === where.severity) &&
    (!where.commitSha || row.commitSha === where.commitSha) &&
    (!where.policyVersion || row.policyVersion === where.policyVersion) &&
    (!where.corpusVersion || row.corpusVersion === where.corpusVersion) &&
    (!where.observedAt?.gte || row.observedAt >= where.observedAt.gte) &&
    (!where.observedAt?.lte || row.observedAt <= where.observedAt.lte);

  return {
    async create({ data }) {
      if (rows.some((row) => row.tenantId === data.tenantId && row.requestId === data.requestId)) {
        throw new Error('duplicate tenant request');
      }
      const row = { ...data, id: `row-${rows.length + 1}`, createdAt: new Date() };
      rows.push(row);
      return row;
    },
    async findFirst({ where }) {
      return (
        rows.find((row) => row.tenantId === where.tenantId && row.requestId === where.requestId) ??
        null
      );
    },
    async findMany({ where, take }) {
      return rows
        .filter((row) => matches(row, where))
        .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())
        .slice(0, take);
    },
    async count({ where }) {
      return rows.filter((row) => matches(row, where)).length;
    },
    async deleteMany({ where }) {
      const before = rows.length;
      rows = rows.filter(
        (row) => !(row.tenantId === where.tenantId && row.expiresAt <= where.expiresAt.lte),
      );
      return { count: before - rows.length };
    },
  };
}

describe('MemoryShadowReportRepository', () => {
  it('survives repository reconstruction and isolates identical request IDs by tenant', async () => {
    const delegate = sharedDelegate();
    const tenantA = new MemoryShadowReportRepository({ memoryShadowReport: delegate });
    const tenantB = new MemoryShadowReportRepository({ memoryShadowReport: delegate });
    const future = new Date('2026-08-23T00:00:00.000Z');

    await tenantA.create(input('tenant-a', 'same-request', future));
    await tenantB.create(input('tenant-b', 'same-request', future));

    const reconstructedA = new MemoryShadowReportRepository({ memoryShadowReport: delegate });
    expect(await reconstructedA.countForTenant('tenant-a')).toBe(1);
    expect(await reconstructedA.findByRequest('tenant-a', 'same-request')).toMatchObject({
      tenantId: 'tenant-a',
      actorUserId: 'tenant-a',
    });
    expect(await reconstructedA.listForTenant('tenant-a')).toHaveLength(1);
    expect(await tenantB.listForTenant('tenant-b')).toHaveLength(1);
  });

  it('requires tenant scope and cannot delete another tenant expired rows', async () => {
    const delegate = sharedDelegate();
    const repository = new MemoryShadowReportRepository({ memoryShadowReport: delegate });
    const expired = new Date('2026-07-01T00:00:00.000Z');
    const now = new Date('2026-07-23T00:00:00.000Z');
    await repository.create(input('tenant-a', 'a', expired));
    await repository.create(input('tenant-b', 'b', expired));

    await expect(repository.countForTenant('')).rejects.toThrow('tenantId is required');
    await expect(repository.findByRequest('', 'a')).rejects.toThrow('tenantId is required');
    await expect(repository.listForTenant('')).rejects.toThrow('tenantId is required');
    await expect(repository.deleteExpiredForTenant('', now)).rejects.toThrow(
      'tenantId is required',
    );

    expect(await repository.deleteExpiredForTenant('tenant-a', now)).toBe(1);
    expect(await repository.countForTenant('tenant-a')).toBe(0);
    expect(await repository.countForTenant('tenant-b')).toBe(1);
  });

  it('filters a tenant run by immutable metadata and observation window', async () => {
    const repository = new MemoryShadowReportRepository({
      memoryShadowReport: sharedDelegate(),
    });
    const future = new Date('2026-08-23T00:00:00.000Z');
    const selected = input('tenant-a', 'selected', future);
    selected.commitSha = 'b'.repeat(40);
    selected.policyVersion = 'policy-v2';
    selected.corpusVersion = 'real-conv-v1';
    selected.observedAt = new Date('2026-07-23T00:10:00.000Z');
    await repository.create(selected);

    const outsideWindow = input('tenant-a', 'outside-window', future);
    outsideWindow.commitSha = selected.commitSha;
    outsideWindow.policyVersion = selected.policyVersion;
    outsideWindow.corpusVersion = selected.corpusVersion;
    outsideWindow.observedAt = new Date('2026-07-23T00:00:00.000Z');
    await repository.create(outsideWindow);
    await repository.create(input('tenant-b', 'other-tenant', future));

    const options = {
      actorUserId: 'tenant-a',
      commitSha: selected.commitSha,
      policyVersion: selected.policyVersion,
      corpusVersion: selected.corpusVersion,
      observedAfter: new Date('2026-07-23T00:05:00.000Z'),
      observedBefore: new Date('2026-07-23T00:15:00.000Z'),
    };
    await expect(repository.listForTenant('tenant-a', options)).resolves.toMatchObject([
      { requestId: 'selected' },
    ]);
    await expect(repository.countForTenant('tenant-a', options)).resolves.toBe(1);
  });
});
