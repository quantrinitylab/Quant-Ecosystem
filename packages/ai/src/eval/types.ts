// ============================================================================
// Memory Evaluation — types (PR-M06)
//
// The eval measures what tests do not: retrieval QUALITY. Each case seeds a
// conversation, then asks queries with expected includes/excludes. The runner
// scores recall accuracy, precision, duplicate rate, latency, and counts of
// wrong/missed memories — the dashboard a production memory system lives by.
// ============================================================================

export interface EvalTurn {
  role: string;
  content: string;
}

export interface EvalQuery {
  query: string;
  /** Substrings that MUST appear in at least one recalled memory. */
  expectIncludes: string[];
  /** Substrings that must NOT appear in any recalled memory (e.g. superseded facts). */
  expectExcludes?: string[];
}

export interface EvalCase {
  id: string;
  seed: EvalTurn[];
  queries: EvalQuery[];
}

export interface EvalScenario {
  name: string;
  description: string;
  /** Marks scenarios that probe known-hard problems (supersession, conflicts). */
  knownHard?: boolean;
  cases: EvalCase[];
}

export interface EvalMetrics {
  scenario: string;
  totalQueries: number;
  /** Fraction of queries where every expected include was found. */
  recallAccuracy: number;
  /** Fraction of queries with no excluded (wrong) memory present. */
  precision: number;
  /** Fraction of recalled results that were duplicates. */
  duplicateRate: number;
  /** Average recall latency (ms). */
  avgLatencyMs: number;
  /** Count of excluded/wrong memories that leaked into results. */
  wrongMemories: number;
  /** Count of expected memories that were never recalled. */
  missedMemories: number;
}
