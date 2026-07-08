// ============================================================================
// Policy Replay (PR-M11b-2)
//
// Deterministic offline experimentation for the acceptance policy. Because every
// policy decision is a pure function of (candidate, existing conflicts), we can
// RECORD decision inputs once and REPLAY them under any policy version WITHOUT
// touching the database or regenerating LLM outputs.
//
// This is the highest-leverage tool for policy evolution: tune thresholds, then
// see exactly which decisions changed and why — measurable, not subjective.
// ============================================================================

import type {
  MemoryAcceptancePolicy,
  PolicyDecision,
  PolicyAction,
  AcceptanceCandidate,
  AcceptanceExisting,
} from '../core/memory-acceptance-policy';

/** A recorded decision point: everything the policy saw + what it decided. */
export interface ReplayRecord {
  candidateId: string;
  candidate: AcceptanceCandidate;
  existing: AcceptanceExisting[];
  decision: PolicyDecision;
  at: number;
}

/** Result of replaying one record under a (possibly different) policy. */
export interface ReplayOutcome {
  candidateId: string;
  original: PolicyAction;
  replayed: PolicyAction;
  changed: boolean;
  originalReason: string;
  replayedReason: string;
  decision: PolicyDecision;
}

/** Replay a recorded decision set through a policy. Pure — no persistence. */
export function replay(records: ReplayRecord[], policy: MemoryAcceptancePolicy): ReplayOutcome[] {
  return records.map((r) => {
    const decision = policy.decide(r.candidate, r.existing);
    return {
      candidateId: r.candidateId,
      original: r.decision.action,
      replayed: decision.action,
      changed: decision.action !== r.decision.action,
      originalReason: r.decision.reason,
      replayedReason: decision.reason,
      decision,
    };
  });
}

// ─── Action histogram ────────────────────────────────────────────────────────

export type ActionHistogram = Record<PolicyAction, number>;

const ZERO_HISTOGRAM = (): ActionHistogram => ({
  store_active: 0,
  store_pending: 0,
  supersede: 0,
  duplicate_skip: 0,
  reject: 0,
  drop: 0,
});

export function histogramOf(actions: PolicyAction[]): ActionHistogram {
  const h = ZERO_HISTOGRAM();
  for (const a of actions) h[a]++;
  return h;
}

// ─── Policy diff (v1 vs v2) ───────────────────────────────────────────────────

export interface PolicyDiff {
  fromVersion: string;
  toVersion: string;
  total: number;
  changed: number;
  before: ActionHistogram;
  after: ActionHistogram;
  /** Counts of each "fromAction -> toAction" transition among changed decisions. */
  transitions: Record<string, number>;
}

export function diffPolicies(
  records: ReplayRecord[],
  from: MemoryAcceptancePolicy,
  to: MemoryAcceptancePolicy,
): PolicyDiff {
  const before = replay(records, from);
  const after = replay(records, to);

  const transitions: Record<string, number> = {};
  let changed = 0;
  for (let i = 0; i < records.length; i++) {
    const b = before[i]!.replayed;
    const a = after[i]!.replayed;
    if (b !== a) {
      changed++;
      const key = `${b} -> ${a}`;
      transitions[key] = (transitions[key] ?? 0) + 1;
    }
  }

  return {
    fromVersion: from.decide(records[0]?.candidate ?? emptyCandidate(), []).policyVersion,
    toVersion: to.decide(records[0]?.candidate ?? emptyCandidate(), []).policyVersion,
    total: records.length,
    changed,
    before: histogramOf(before.map((o) => o.replayed)),
    after: histogramOf(after.map((o) => o.replayed)),
    transitions,
  };
}

function emptyCandidate(): AcceptanceCandidate {
  return { confidence: 1, trust: 1, provenance: 'rule' };
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function formatPolicyDiff(diff: PolicyDiff): string {
  const lines: string[] = ['', '=== Policy Diff ===', `${diff.fromVersion} -> ${diff.toVersion}`];
  lines.push(`total: ${diff.total}  changed: ${diff.changed}`);
  lines.push('changed decisions:');
  const keys = Object.keys(diff.transitions).sort();
  if (keys.length === 0) lines.push('  (none)');
  for (const k of keys) lines.push(`  ${k} : ${diff.transitions[k]}`);
  lines.push('');
  return lines.join('\n');
}
