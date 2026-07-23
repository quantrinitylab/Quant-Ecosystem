import { describe, expect, it } from 'vitest';
import type { ShadowReport } from '../core/memory-facade';
import {
  WU4_REQUIRED_RECALLS,
  WU4_TRAFFIC_MANIFEST_VERSION,
  buildQuantaiShadowTrafficPlan,
  evaluateQuantaiShadowEvidence,
  type PersistedShadowEvidence,
} from '../eval/quantai-shadow-evidence';
import { CORPUS_VERSION, realConversationCorpus } from '../eval/corpus';

const actorUserId = 'wu4-test-actor';
const commitSha = 'a'.repeat(40);
const policyVersion = 'memory-policy-v1';

function report(index: number): ShadowReport {
  return {
    requestId: `wu4-request-${index}`,
    mode: 'shadow',
    actorUserId,
    query: `query-${index}`,
    legacy: { recalled: [`memory-${index}`], latencyMs: 10 },
    next: { recalled: [`memory-${index}`], latencyMs: 10.5 },
    divergence: {
      onlyLegacy: [],
      onlyNew: [],
      agreementRate: 1,
      severity: 'LOW',
    },
    at: Date.parse('2026-07-23T00:00:00.000Z') + index,
  };
}

function record(index: number): PersistedShadowEvidence {
  return {
    tenantId: actorUserId,
    actorUserId,
    commitSha,
    policyVersion,
    corpusVersion: CORPUS_VERSION,
    observedAt: new Date(Date.parse('2026-07-23T00:00:00.000Z') + index),
    report: report(index),
  };
}

const expectation = {
  actorUserId,
  commitSha,
  policyVersion,
  corpusVersion: CORPUS_VERSION,
};

describe('QuantAI WU4 shadow evidence', () => {
  it('builds a deterministic 500-recall plan covering every corpus category', () => {
    const first = buildQuantaiShadowTrafficPlan();
    const second = buildQuantaiShadowTrafficPlan();

    expect(first).toEqual(second);
    expect(first.manifestVersion).toBe(WU4_TRAFFIC_MANIFEST_VERSION);
    expect(first.corpusVersion).toBe(CORPUS_VERSION);
    expect(first.recalls).toHaveLength(WU4_REQUIRED_RECALLS);
    expect(first.observations.length).toBeGreaterThan(0);
    expect(new Set(first.recalls.map((item) => item.scenarioId))).toEqual(
      new Set(realConversationCorpus.map((scenario) => scenario.name)),
    );
    expect(first.recalls[0]?.sequence).toBe(0);
    expect(first.recalls.at(-1)?.sequence).toBe(WU4_REQUIRED_RECALLS - 1);
  });

  it('replays exactly 500 durable reports but remains HOLD when pending agreement is absent', () => {
    const records = Array.from({ length: WU4_REQUIRED_RECALLS }, (_, index) => record(index));
    const result = evaluateQuantaiShadowEvidence(records, expectation);

    expect(result.reportCount).toBe(WU4_REQUIRED_RECALLS);
    expect(result.reproducibleCount).toBe(WU4_REQUIRED_RECALLS);
    expect(result.aggregate.avgAgreement).toBe(1);
    expect(result.aggregate.backendErrors).toBe(0);
    expect(result.gates.coreGates.passed).toBe(true);
    expect(result.gates).toMatchObject({
      passed: false,
      decision: 'HOLD_PENDING_WU5',
      pendingAgreement: { status: 'not-measured', required: 0.98 },
    });
    expect(result.gates.reasons).toContain('pending agreement is not measured (required >98%)');
  });

  it('refuses partial, mixed-tenant, mixed-freeze, and tampered evidence', () => {
    const records = Array.from({ length: WU4_REQUIRED_RECALLS }, (_, index) => record(index));
    expect(() => evaluateQuantaiShadowEvidence(records.slice(1), expectation)).toThrow(
      'requires exactly 500 reports',
    );

    const wrongTenant = records.map((item, index) =>
      index === 0 ? { ...item, tenantId: 'other-tenant' } : item,
    );
    expect(() => evaluateQuantaiShadowEvidence(wrongTenant, expectation)).toThrow(
      'Tenant boundary mismatch',
    );

    const mixedFreeze = records.map((item, index) =>
      index === 0 ? { ...item, policyVersion: 'different-policy' } : item,
    );
    expect(() => evaluateQuantaiShadowEvidence(mixedFreeze, expectation)).toThrow(
      'Mixed freeze metadata',
    );

    const tampered = records.map((item, index) =>
      index === 0
        ? {
            ...item,
            report: {
              ...item.report,
              divergence: { ...item.report.divergence, agreementRate: 0 },
            },
          }
        : item,
    );
    expect(() => evaluateQuantaiShadowEvidence(tampered, expectation)).toThrow(
      'Non-reproducible divergence',
    );
  });
});
