import { describe, expect, it, vi } from 'vitest';
import type { ShadowReport } from '@quant/ai';
import type { CreateMemoryShadowReportInput } from '@quant/database';
import { PrismaShadowReportSink, type ShadowReportWriter } from '../services/shadow-report.service';

const observedAt = Date.parse('2026-07-23T00:00:00.000Z');

function report(overrides: Partial<ShadowReport> = {}): ShadowReport {
  return {
    requestId: 'request-1',
    mode: 'shadow',
    actorUserId: 'actor-a',
    query: 'where do I live?',
    legacy: { recalled: ['Patna'], latencyMs: 4 },
    next: { recalled: ['Patna'], latencyMs: 5 },
    divergence: {
      onlyLegacy: [],
      onlyNew: [],
      agreementRate: 1,
      severity: 'LOW',
    },
    at: observedAt,
    ...overrides,
  };
}

function writer() {
  let captured: CreateMemoryShadowReportInput | undefined;
  const value: ShadowReportWriter = {
    create: vi.fn(async (input) => {
      captured = input;
      return { ...input, id: 'row-1', createdAt: new Date() };
    }),
    countForTenant: vi.fn(async () => 7),
  };
  return { value, captured: () => captured };
}

const validConfig = {
  commitSha: 'a'.repeat(40),
  policyVersion: 'policy-v1',
  corpusVersion: 'corpus-v1',
};

describe('PrismaShadowReportSink', () => {
  it('uses the authenticated actor as personal tenant and stores replay metadata', async () => {
    const target = writer();
    const sink = new PrismaShadowReportSink(target.value, validConfig);

    await sink.emit(report());

    expect(target.captured()).toMatchObject({
      tenantId: 'actor-a',
      orgId: null,
      actorUserId: 'actor-a',
      requestId: 'request-1',
      commitSha: validConfig.commitSha,
      policyVersion: 'policy-v1',
      corpusVersion: 'corpus-v1',
      infrastructureError: false,
      observedAt: new Date(observedAt),
      expiresAt: new Date(observedAt + 30 * 86_400_000),
    });
    await expect(sink.countForActor('actor-a')).resolves.toBe(7);
    expect(target.value.countForTenant).toHaveBeenCalledWith('actor-a');
  });

  it('marks reports with new-path errors as infrastructure failures', async () => {
    const target = writer();
    const sink = new PrismaShadowReportSink(target.value, validConfig);
    await sink.emit(
      report({
        next: { recalled: [], latencyMs: 3, error: 'qdrant unavailable' },
      }),
    );
    expect(target.captured()?.infrastructureError).toBe(true);
  });

  it.each([
    [{ ...validConfig, commitSha: 'short' }, /40-character/],
    [{ ...validConfig, policyVersion: ' ' }, /POLICY_VERSION/],
    [{ ...validConfig, corpusVersion: '' }, /CORPUS_VERSION/],
    [{ ...validConfig, retentionDays: 0 }, /between 1 and 90/],
    [{ ...validConfig, retentionDays: 91 }, /between 1 and 90/],
    [{ ...validConfig, retentionDays: 1.5 }, /integer/],
  ])('rejects invalid persistence configuration %#', (config, expected) => {
    expect(() => new PrismaShadowReportSink(writer().value, config)).toThrow(expected);
  });

  it('rejects invalid report boundaries', async () => {
    const sink = new PrismaShadowReportSink(writer().value, validConfig);
    await expect(sink.emit(report({ mode: 'legacy' }))).rejects.toThrow('shadow-mode');
    await expect(sink.emit(report({ actorUserId: '' }))).rejects.toThrow('actorUserId');
    await expect(sink.emit(report({ at: Number.NaN }))).rejects.toThrow('timestamp');
    expect(() => sink.countForActor('')).toThrow('actorUserId');
  });
});
