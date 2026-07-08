// ============================================================================
// AI Core — Memory Conflict Resolution (PR-M07: Fact Supersession Engine)
//
// The hardest memory problem: a NEW fact often SUPERSEDES an old one.
//   "I live in Patna"  ...later...  "I moved to Bangalore"
// The old value must stop being recalled. This logic lives in its OWN port so
// the extractor and service stay simple (no God Object).
//
// DefaultMemoryConflictResolver is a RULE ENGINE. Each SlotRule maps a fact to a
// (slot, value) pair. Two facts in the SAME single-valued slot with DIFFERENT
// values → the new one supersedes the old. Same value → duplicate. No shared
// slot → unrelated. Adding an LLM resolver later = one more rule/implementation.
// ============================================================================

export type ConflictVerdict = 'supersedes' | 'contradicts' | 'duplicate' | 'unrelated';

export interface ConflictDecision {
  /** The existing memory this decision is about (its port id / logicalId). */
  existingId: string;
  verdict: ConflictVerdict;
}

/** The new fact being considered for storage. */
export interface ConflictCandidate {
  content: string;
  kind: string;
}

/** A pre-existing memory to compare against. */
export interface ExistingMemoryRef {
  id: string;
  content: string;
  kind: string;
}

/**
 * Decides how a candidate relates to each existing memory. Pure and
 * synchronous — no storage, no side effects. The service acts on the verdicts.
 */
export interface MemoryConflictResolver {
  resolve(candidate: ConflictCandidate, existing: ExistingMemoryRef[]): ConflictDecision[];
}

// ─── Slot rules ────────────────────────────────────────────────────────────────

/** Maps a fact's content to a (slot, value). Returns null if it doesn't apply. */
export interface SlotRule {
  extract(content: string): { slot: string; value: string } | null;
  /**
   * 'sentiment' semantics: a polarity flip (like↔dislike) is a CONTRADICTION;
   * a plain value change is a SUPERSEDE. Both retire the old memory.
   */
  readonly conflictKind?: 'supersedes' | 'contradicts';
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\bnow\b/g, '')
    .replace(/[.!?,;:]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** "lives in <city>" — single-valued residence. */
export class ResidenceRule implements SlotRule {
  extract(content: string): { slot: string; value: string } | null {
    const m = /\blives? in (.+)/i.exec(content);
    return m?.[1] ? { slot: 'residence', value: norm(m[1]) } : null;
  }
}

/** "works at <org>" — single-valued current employer. */
export class EmployerRule implements SlotRule {
  extract(content: string): { slot: string; value: string } | null {
    const m = /\bworks? (?:at|for) (.+)/i.exec(content);
    return m?.[1] ? { slot: 'employer', value: norm(m[1]) } : null;
  }
}

/** "name is <name>" — single-valued name. */
export class NameRule implements SlotRule {
  extract(content: string): { slot: string; value: string } | null {
    const m = /\bname is (.+)/i.exec(content);
    return m?.[1] ? { slot: 'name', value: norm(m[1]) } : null;
  }
}

/** "favourite <thing> is <value>" — single-valued per thing. */
export class FavoriteRule implements SlotRule {
  extract(content: string): { slot: string; value: string } | null {
    const m = /\bfavou?rite (.+?) is (.+)/i.exec(content);
    if (!m?.[1] || !m?.[2]) return null;
    return { slot: `favourite:${norm(m[1])}`, value: norm(m[2]) };
  }
}

/** "likes/dislikes <object>" — single-valued PER object (polarity flip = contradiction). */
export class SentimentRule implements SlotRule {
  readonly conflictKind = 'contradicts' as const;
  extract(content: string): { slot: string; value: string } | null {
    const m = /\b(likes|dislikes) (.+)/i.exec(content);
    if (!m?.[1] || !m?.[2]) return null;
    return { slot: `sentiment:${norm(m[2])}`, value: norm(m[1]) };
  }
}

export const DEFAULT_SLOT_RULES: SlotRule[] = [
  new ResidenceRule(),
  new EmployerRule(),
  new NameRule(),
  new FavoriteRule(),
  new SentimentRule(),
];

// ─── The resolver ────────────────────────────────────────────────────────────

export class DefaultMemoryConflictResolver implements MemoryConflictResolver {
  private readonly rules: SlotRule[];

  constructor(rules: SlotRule[] = DEFAULT_SLOT_RULES) {
    this.rules = rules;
  }

  resolve(candidate: ConflictCandidate, existing: ExistingMemoryRef[]): ConflictDecision[] {
    const cand = this.match(candidate.content);
    if (!cand) {
      return existing.map((e) => ({ existingId: e.id, verdict: 'unrelated' as const }));
    }

    return existing.map((e) => {
      const ex = this.match(e.content);
      if (!ex || ex.slot !== cand.slot) {
        return { existingId: e.id, verdict: 'unrelated' as const };
      }
      if (ex.value === cand.value) {
        return { existingId: e.id, verdict: 'duplicate' as const };
      }
      return { existingId: e.id, verdict: cand.conflictKind ?? ('supersedes' as const) };
    });
  }

  private match(
    content: string,
  ): { slot: string; value: string; conflictKind?: 'supersedes' | 'contradicts' } | null {
    for (const rule of this.rules) {
      const hit = rule.extract(content);
      if (hit) {
        return rule.conflictKind ? { ...hit, conflictKind: rule.conflictKind } : hit;
      }
    }
    return null;
  }
}
