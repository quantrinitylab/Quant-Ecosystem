import type { ShadowReport } from '../core/memory-facade';
import { CORPUS_VERSION, corpusMetaFor, realConversationCorpus } from './corpus';
import { aggregateShadowReports, evaluateCutoverGates, verifyReproducible } from './shadow-replay';

export const WU4_TRAFFIC_MANIFEST_VERSION = 'quantai-shadow-traffic-v1';
export const WU4_REQUIRED_RECALLS = 500;

export interface QuantaiShadowObservation {
  scenarioId: string;
  caseId: string;
  session: string;
  role: string;
  content: string;
}

export interface QuantaiShadowRecall {
  sequence: number;
  scenarioId: string;
  caseId: string;
  queryIndex: number;
  query: string;
  expectedIncludes: string[];
  expectedExcludes: string[];
}

export interface QuantaiShadowTrafficPlan {
  manifestVersion: typeof WU4_TRAFFIC_MANIFEST_VERSION;
  corpusVersion: string;
  observations: QuantaiShadowObservation[];
  recalls: QuantaiShadowRecall[];
}

export interface PersistedShadowEvidence {
  tenantId: string;
  actorUserId: string;
  commitSha: string;
  policyVersion: string;
  corpusVersion: string;
  observedAt: Date;
  report: ShadowReport;
}

export interface WU4EvidenceExpectation {
  actorUserId: string;
  commitSha: string;
  policyVersion: string;
  corpusVersion: string;
  requiredReports?: number;
}

export interface WU4GateSnapshot {
  passed: false;
  decision: 'HOLD_PENDING_WU5';
  pendingAgreement: { status: 'not-measured'; required: number };
  coreGates: { passed: boolean; reasons: string[] };
  reasons: string[];
}

export interface WU4EvidenceSummary {
  reportCount: number;
  reproducibleCount: number;
  legacyAvgLatencyMs: number;
  aggregate: ReturnType<typeof aggregateShadowReports>;
  gates: WU4GateSnapshot;
}

/** Build a deterministic traffic plan over the immutable real-conversation corpus. */
export function buildQuantaiShadowTrafficPlan(
  recallCount = WU4_REQUIRED_RECALLS,
): QuantaiShadowTrafficPlan {
  if (!Number.isInteger(recallCount) || recallCount < 1) {
    throw new Error('recallCount must be a positive integer');
  }

  const observations: QuantaiShadowObservation[] = [];
  const templates: Omit<QuantaiShadowRecall, 'sequence'>[] = [];
  for (const scenario of realConversationCorpus) {
    if (!corpusMetaFor(scenario.name)) {
      throw new Error(`Missing immutable corpus metadata for ${scenario.name}`);
    }
    for (const evalCase of scenario.cases) {
      const session = `wu4:${scenario.name}:${evalCase.id}`;
      for (const turn of evalCase.seed) {
        observations.push({
          scenarioId: scenario.name,
          caseId: evalCase.id,
          session,
          role: turn.role,
          content: turn.content,
        });
      }
      evalCase.queries.forEach((query, queryIndex) => {
        templates.push({
          scenarioId: scenario.name,
          caseId: evalCase.id,
          queryIndex,
          query: query.query,
          expectedIncludes: [...query.expectIncludes],
          expectedExcludes: [...(query.expectExcludes ?? [])],
        });
      });
    }
  }
  if (templates.length === 0) throw new Error('Representative corpus has no recall queries');

  const recalls = Array.from({ length: recallCount }, (_, sequence) => ({
    ...templates[sequence % templates.length]!,
    sequence,
  }));
  return {
    manifestVersion: WU4_TRAFFIC_MANIFEST_VERSION,
    corpusVersion: CORPUS_VERSION,
    observations,
    recalls,
  };
}

/** Validate durable rows and produce a non-authoritative WU4 gate snapshot. */
export function evaluateQuantaiShadowEvidence(
  records: PersistedShadowEvidence[],
  expected: WU4EvidenceExpectation,
): WU4EvidenceSummary {
  const requiredReports = expected.requiredReports ?? WU4_REQUIRED_RECALLS;
  if (records.length !== requiredReports) {
    throw new Error(`WU4 requires exactly ${requiredReports} reports; received ${records.length}`);
  }

  for (const record of records) {
    if (record.tenantId !== expected.actorUserId || record.actorUserId !== expected.actorUserId) {
      throw new Error(`Tenant boundary mismatch for ${record.report.requestId}`);
    }
    if (record.report.actorUserId !== expected.actorUserId || record.report.mode !== 'shadow') {
      throw new Error(`Invalid shadow identity or mode for ${record.report.requestId}`);
    }
    if (
      record.commitSha !== expected.commitSha ||
      record.policyVersion !== expected.policyVersion ||
      record.corpusVersion !== expected.corpusVersion
    ) {
      throw new Error(`Mixed freeze metadata for ${record.report.requestId}`);
    }
    if (!verifyReproducible(record.report)) {
      throw new Error(`Non-reproducible divergence for ${record.report.requestId}`);
    }
  }

  const reports = records.map((record) => record.report);
  const aggregate = aggregateShadowReports(reports);
  const legacyAvgLatencyMs =
    reports.reduce((sum, report) => sum + report.legacy.latencyMs, 0) / reports.length;
  const coreGates = evaluateCutoverGates(aggregate, legacyAvgLatencyMs);
  const pendingReason = 'pending agreement is not measured (required >98%)';
  return {
    reportCount: reports.length,
    reproducibleCount: reports.length,
    legacyAvgLatencyMs,
    aggregate,
    gates: {
      passed: false,
      decision: 'HOLD_PENDING_WU5',
      pendingAgreement: { status: 'not-measured', required: 0.98 },
      coreGates,
      reasons: [...coreGates.reasons, pendingReason],
    },
  };
}
