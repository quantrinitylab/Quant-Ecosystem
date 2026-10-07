// ============================================================================
// AI Core — Memory Conflict Resolution (PR-M07 + PR-M09)
//
// Decides how a new fact relates to existing ones. PR-M09 (ADR-008) adds:
//   - retraction: a negation ("I don't live in Patna anymore") retires a slot
//     WITHOUT storing a replacement,
//   - richer decisions: { verdict, confidence, reason },
//   - a SLOT REGISTRY (SlotDefinition) replacing hardcoded rule classes.
//
// Pairwise verdicts: supersedes | contradicts | duplicate | retracts | unrelated
// (negative facts are a UNARY polarity property of a candidate, carried in
// metadata — not a pairwise verdict; see ADR-008.)
// ============================================================================

export type ConflictVerdict = 'supersedes' | 'contradicts' | 'duplicate' | 'retracts' | 'unrelated';

export interface ConflictDecision {
  /** The existing memory this decision is about (its port id / logicalId). */
  existingId: string;
  verdict: ConflictVerdict;
  /** Resolver confidence (0-1). 1.0 for deterministic rules; the LLM resolver varies it. */
  confidence: number;
  /** Machine-readable rationale, e.g. 'same_slot_newer_value'. */
  reason: string;
}

/** The new fact being considered. `operation:'retract'` ends a slot with no replacement. */
export interface ConflictCandidate {
  content: string;
  kind: string;
  operation?: 'store' | 'retract';
  /** For retract intents: the SlotDefinition id to end (e.g. 'residence'). */
  slot?: string;
  polarity?: 'positive' | 'negative';
}

export interface ExistingMemoryRef {
  id: string;
  content: string;
  kind: string;
}

export interface MemoryConflictResolver {
  resolve(candidate: ConflictCandidate, existing: ExistingMemoryRef[]): ConflictDecision[];
}

// ─── Slot registry (data-driven; replaces hardcoded rule classes) ────────────

export interface SlotMatch {
  /** The concrete slot key (may be dynamic, e.g. 'favourite:language'). */
  slot: string;
  value: string;
}

export interface SlotDefinition {
  /** Stable family id (e.g. 'residence'); used by retract intents. */
  readonly id: string;
  /** Query hint to find existing memories of this slot (for retraction recall). */
  readonly recallHint: string;
  /** How a value change is classified. */
  readonly conflictKind: 'supersedes' | 'contradicts';
  /** Extract (slot, value) from content, or null if it doesn't apply. */
  match(content: string): SlotMatch | null;
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\bnow\b/g, '')
    .replace(/[.!?,;:]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function simpleSlot(
  id: string,
  recallHint: string,
  re: RegExp,
  conflictKind: 'supersedes' | 'contradicts' = 'supersedes',
): SlotDefinition {
  return {
    id,
    recallHint,
    conflictKind,
    match(content: string): SlotMatch | null {
      const m = re.exec(content);
      return m?.[1] ? { slot: id, value: norm(m[1]) } : null;
    },
  };
}

export const residenceSlot = simpleSlot('residence', 'lives in', /\blives? in (.+)/i);
export const employerSlot = simpleSlot('employer', 'works at', /\bworks? (?:at|for) (.+)/i);
export const nameSlot = simpleSlot('name', 'name is', /\bname is (.+)/i);

/** "favourite <thing> is <value>" — slot is namespaced per thing. */
export const favouriteSlot: SlotDefinition = {
  id: 'favourite',
  recallHint: 'favourite',
  conflictKind: 'supersedes',
  match(content: string): SlotMatch | null {
    const m = /\bfavou?rite (.+?) is (.+)/i.exec(content);
    if (!m?.[1] || !m?.[2]) return null;
    return { slot: `favourite:${norm(m[1])}`, value: norm(m[2]) };
  },
};

/** "likes/dislikes <object>" — polarity per object; a flip is a contradiction. */
export const sentimentSlot: SlotDefinition = {
  id: 'sentiment',
  recallHint: 'likes',
  conflictKind: 'contradicts',
  match(content: string): SlotMatch | null {
    const m = /\b(likes|dislikes) (.+)/i.exec(content);
    if (!m?.[1] || !m?.[2]) return null;
    return { slot: `sentiment:${norm(m[2])}`, value: norm(m[1]) };
  },
};

export const DEFAULT_SLOT_REGISTRY: SlotDefinition[] = [
  residenceSlot,
  employerSlot,
  nameSlot,
  favouriteSlot,
  sentimentSlot,
];

/** The recall hint for a slot id (for finding memories to retract). */
export function recallHintForSlot(
  slotId: string,
  registry: SlotDefinition[] = DEFAULT_SLOT_REGISTRY,
): string | null {
  return registry.find((d) => d.id === slotId)?.recallHint ?? null;
}

// ─── Resolver ─────────────────────────────────────────────────────────────────

const decision = (
  existingId: string,
  verdict: ConflictVerdict,
  reason: string,
  confidence = 1,
): ConflictDecision => ({ existingId, verdict, confidence, reason });

export class DefaultMemoryConflictResolver implements MemoryConflictResolver {
  private readonly registry: SlotDefinition[];

  constructor(registry: SlotDefinition[] = DEFAULT_SLOT_REGISTRY) {
    this.registry = registry;
  }

  resolve(candidate: ConflictCandidate, existing: ExistingMemoryRef[]): ConflictDecision[] {
    // Retraction: end every existing memory in the target slot; store nothing.
    if (candidate.operation === 'retract') {
      const def = this.registry.find((d) => d.id === candidate.slot);
      return existing.map((e) =>
        def && def.match(e.content)
          ? decision(e.id, 'retracts', 'slot_retracted')
          : decision(e.id, 'unrelated', 'different_slot'),
      );
    }

    // Store: compare the candidate's slot against each existing memory's slot.
    const cand = this.match(candidate.content);
    if (!cand) {
      return existing.map((e) => decision(e.id, 'unrelated', 'candidate_no_slot'));
    }

    return existing.map((e) => {
      const ex = this.match(e.content);
      if (!ex || ex.match.slot !== cand.match.slot) {
        return decision(e.id, 'unrelated', 'different_slot');
      }
      if (ex.match.value === cand.match.value) {
        return decision(e.id, 'duplicate', 'same_slot_same_value');
      }
      const verdict = cand.def.conflictKind;
      return decision(
        e.id,
        verdict,
        verdict === 'contradicts' ? 'same_slot_polarity_flip' : 'same_slot_newer_value',
      );
    });
  }

  private match(content: string): { def: SlotDefinition; match: SlotMatch } | null {
    for (const def of this.registry) {
      const m = def.match(content);
      if (m) return { def, match: m };
    }
    return null;
  }
}
