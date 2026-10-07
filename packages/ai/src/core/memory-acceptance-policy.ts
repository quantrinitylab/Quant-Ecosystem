// ============================================================================
// AI Core — MemoryAcceptancePolicy (PR-M11b, ADR-009)
//
// A PURE policy engine: given a candidate (confidence/trust/provenance) and the
// conflicting existing memories (state/weight/verdict), decide what to DO. It
// has no persistence logic — DefaultMemoryService executes the returned
// PolicyDecision. This keeps business policy separate from the deterministic
// conflict resolver and from storage.
// ============================================================================

import type { ConflictVerdict } from './memory-conflict';

export interface MemoryPolicy {
  version: string;
  activateThreshold: number; // effective weight ≥ this → Active
  pendingThreshold: number; // [pending, activate) → Pending; below → drop
  epsilon: number; // supersede tolerance band
}

export const DEFAULT_MEMORY_POLICY: MemoryPolicy = {
  version: 'v1',
  activateThreshold: 0.7,
  pendingThreshold: 0.35,
  epsilon: 0.1,
};

export type PolicyAction =
  | 'store_active'
  | 'store_pending'
  | 'supersede'
  | 'duplicate_skip'
  | 'reject'
  | 'drop';

export interface PolicyDecision {
  action: PolicyAction;
  reason: string;
  effectiveWeight: number;
  policyVersion: string;
  /** Existing memory ids to retire when action === 'supersede'. */
  supersedeIds: string[];
}

export interface AcceptanceCandidate {
  confidence: number;
  trust: number;
  /** Hierarchical provenance, e.g. 'user.explicit', 'llm.gpt5', 'rule'. */
  provenance: string;
  fingerprint?: string;
}

export interface AcceptanceExisting {
  id: string;
  state: string; // 'active' | 'verified' | 'pending' | ...
  effectiveWeight: number;
  verdict: ConflictVerdict;
  fingerprint?: string;
}

export interface MemoryAcceptancePolicy {
  decide(candidate: AcceptanceCandidate, existing: AcceptanceExisting[]): PolicyDecision;
}

/** Effective weight: a barely-trusted source caps a confident extraction. */
export function effectiveWeight(confidence: number, trust: number): number {
  return Math.min(confidence, trust);
}

export class DefaultMemoryAcceptancePolicy implements MemoryAcceptancePolicy {
  private readonly policy: MemoryPolicy;

  constructor(policy: MemoryPolicy = DEFAULT_MEMORY_POLICY) {
    this.policy = policy;
  }

  decide(candidate: AcceptanceCandidate, existing: AcceptanceExisting[]): PolicyDecision {
    const ew = effectiveWeight(candidate.confidence, candidate.trust);
    const mk = (
      action: PolicyAction,
      reason: string,
      supersedeIds: string[] = [],
    ): PolicyDecision => ({
      action,
      reason,
      effectiveWeight: ew,
      policyVersion: this.policy.version,
      supersedeIds,
    });

    // 1. Idempotency: an identical fingerprint already stored → no-op.
    if (candidate.fingerprint && existing.some((e) => e.fingerprint === candidate.fingerprint)) {
      return mk('duplicate_skip', 'idempotent_fingerprint');
    }

    // 2. Duplicate by value (resolver said so).
    if (existing.some((e) => e.verdict === 'duplicate')) {
      return mk('duplicate_skip', 'same_slot_same_value');
    }

    // 3. Too weak to store at all.
    if (ew < this.policy.pendingThreshold) {
      return mk('drop', 'below_pending_threshold');
    }

    const conflicts = existing.filter(
      (e) => e.verdict === 'supersedes' || e.verdict === 'contradicts',
    );

    // 4. No conflict: activate or hold pending on weight.
    if (conflicts.length === 0) {
      return ew >= this.policy.activateThreshold
        ? mk('store_active', 'above_activate')
        : mk('store_pending', 'low_confidence');
    }

    // 5. Verified is protected from unverified/non-user candidates.
    const fromUserOrVerified =
      candidate.provenance.startsWith('user') || candidate.provenance === 'verified';
    if (conflicts.some((c) => c.state === 'verified') && !fromUserOrVerified) {
      return mk('store_pending', 'verified_conflict');
    }

    // 6. Weight guard: only supersede if we are at least as strong (within ε).
    const maxExisting = Math.max(...conflicts.map((c) => c.effectiveWeight));
    if (ew >= maxExisting - this.policy.epsilon) {
      return mk(
        'supersede',
        'outweighs_existing',
        conflicts.map((c) => c.id),
      );
    }
    return mk('store_pending', 'weaker_than_existing');
  }
}
