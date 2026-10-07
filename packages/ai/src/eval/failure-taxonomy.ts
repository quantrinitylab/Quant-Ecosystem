// ============================================================================
// Failure taxonomy (Agent E) — MUTUALLY EXCLUSIVE attribution
//
// Every failed evaluation case is assigned to EXACTLY ONE category. No double
// counting — that is what lets us know where improvements actually come from
// (e.g. "extraction is noisy" vs "the acceptance policy is too permissive").
// ============================================================================

/** The four — and only four — top-level failure owners. */
export type FailureCategory = 'extractor' | 'policy' | 'retrieval' | 'infrastructure';

/**
 * Sub-causes, each belonging to exactly one category. Every sub-cause is
 * ACTIONABLE — it names a specific, fixable defect so the owning team is
 * unambiguous (no generic "extractor failure").
 */
export const FAILURE_SUBCAUSES = {
  extractor: [
    'missed_fact', // a fact that should have been extracted was not
    'hallucinated_fact', // invented / wrong subject / hypothetical
    'missed_entity', // a named entity was not identified
    'wrong_slot_or_value', // extracted but with the wrong slot/value
    'wrong_temporal', // stored a past ("used to") value as current
    'incorrect_normalization', // value not normalized (e.g. typo not canonicalized)
    'confidence_miscalibration', // stated confidence far from observed accuracy
  ],
  policy: [
    'wrong_supersede', // superseded something it should not have
    'wrong_pending', // held Pending a fact that should be Active
    'wrong_reject_or_drop', // dropped/rejected a true positive
    'missed_conflict', // failed to detect a real conflict
    'threshold_miscalibration', // activate/pending threshold set wrong
  ],
  retrieval: [
    'relevant_not_returned', // the right memory exists but was not recalled
    'irrelevant_returned', // an unrelated memory surfaced
    'ranking_too_low', // relevant memory returned but below the cutoff
    'embedding_quality', // poor embedding caused a semantic miss
  ],
  infrastructure: [
    'db_error',
    'vector_backend_error',
    'llm_error_or_timeout',
    'malformed_llm_output', // model returned unparseable/invalid JSON
    'env_misconfig',
  ],
} as const;

/**
 * HIERARCHICAL ownership: Team → Area. Scales as dozens of engineers work on
 * Quant — a failure routes to a team AND a specific area within it.
 */
export interface Ownership {
  team: string;
  area: string;
}

export const SUBCAUSE_OWNERSHIP: Record<string, Ownership> = {
  // AI Team
  missed_fact: { team: 'AI', area: 'Extraction' },
  hallucinated_fact: { team: 'AI', area: 'Extraction' },
  missed_entity: { team: 'AI', area: 'Extraction' },
  wrong_slot_or_value: { team: 'AI', area: 'Extraction' },
  wrong_temporal: { team: 'AI', area: 'Prompt' },
  incorrect_normalization: { team: 'AI', area: 'Extraction' },
  confidence_miscalibration: { team: 'AI', area: 'Model' },
  // Memory Team
  wrong_supersede: { team: 'Memory', area: 'Conflict' },
  wrong_pending: { team: 'Memory', area: 'Acceptance' },
  wrong_reject_or_drop: { team: 'Memory', area: 'Acceptance' },
  missed_conflict: { team: 'Memory', area: 'Conflict' },
  threshold_miscalibration: { team: 'Memory', area: 'Policy' },
  // Retrieval Team
  relevant_not_returned: { team: 'Retrieval', area: 'Recall' },
  irrelevant_returned: { team: 'Retrieval', area: 'Ranking' },
  ranking_too_low: { team: 'Retrieval', area: 'Ranking' },
  embedding_quality: { team: 'Retrieval', area: 'Embedding' },
  // Platform Team
  db_error: { team: 'Platform', area: 'Storage' },
  vector_backend_error: { team: 'Platform', area: 'Storage' },
  llm_error_or_timeout: { team: 'Platform', area: 'Infra' },
  malformed_llm_output: { team: 'Platform', area: 'Infra' },
  env_misconfig: { team: 'Platform', area: 'Infra' },
};

/** Category → team (coarse view; area comes from the sub-cause). */
export const CATEGORY_OWNER: Record<FailureCategory, string> = {
  extractor: 'AI',
  policy: 'Memory',
  retrieval: 'Retrieval',
  infrastructure: 'Platform',
};

export type FailureSubCause =
  | (typeof FAILURE_SUBCAUSES)['extractor'][number]
  | (typeof FAILURE_SUBCAUSES)['policy'][number]
  | (typeof FAILURE_SUBCAUSES)['retrieval'][number]
  | (typeof FAILURE_SUBCAUSES)['infrastructure'][number];

/** One classified failure. `category` and `ownership` are derived from `subCause`. */
export interface FailureRecord {
  caseId: string;
  category: FailureCategory;
  ownership: Ownership;
  subCause: FailureSubCause;
  evidence: string;
  corpusVersion: string;
}

/** Reverse index: sub-cause → its (single) owning category. Enforces exclusivity. */
const SUBCAUSE_TO_CATEGORY: Record<string, FailureCategory> = (() => {
  const map: Record<string, FailureCategory> = {};
  for (const [category, subs] of Object.entries(FAILURE_SUBCAUSES)) {
    for (const sub of subs) {
      if (map[sub]) {
        throw new Error(
          `Taxonomy invariant violated: sub-cause "${sub}" belongs to two categories`,
        );
      }
      map[sub] = category as FailureCategory;
    }
  }
  return map;
})();

/** Classify a failure by its sub-cause. The category is always derived (single owner). */
export function classifyFailure(
  caseId: string,
  subCause: FailureSubCause,
  evidence: string,
  corpusVersion: string,
): FailureRecord {
  const category = SUBCAUSE_TO_CATEGORY[subCause];
  if (!category) throw new Error(`Unknown sub-cause: ${subCause}`);
  const ownership = SUBCAUSE_OWNERSHIP[subCause];
  if (!ownership) throw new Error(`No ownership mapped for sub-cause: ${subCause}`);
  return { caseId, category, ownership, subCause, evidence, corpusVersion };
}

export interface FailureSummary {
  total: number;
  byCategory: Record<FailureCategory, number>;
  bySubCause: Record<string, number>;
}

/** Aggregate classified failures. Category counts sum to total (mutual exclusivity). */
export function summarizeFailures(records: FailureRecord[]): FailureSummary {
  const byCategory: Record<FailureCategory, number> = {
    extractor: 0,
    policy: 0,
    retrieval: 0,
    infrastructure: 0,
  };
  const bySubCause: Record<string, number> = {};
  for (const r of records) {
    byCategory[r.category]++;
    bySubCause[r.subCause] = (bySubCause[r.subCause] ?? 0) + 1;
  }
  return { total: records.length, byCategory, bySubCause };
}
