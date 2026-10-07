import { describe, it, expect } from 'vitest';
import {
  realConversationCorpus,
  CORPUS_VERSION,
  CORPUS_CATEGORIES,
  corpusMetaFor,
} from '../eval/corpus';
import {
  FAILURE_SUBCAUSES,
  SUBCAUSE_OWNERSHIP,
  classifyFailure,
  summarizeFailures,
  type FailureRecord,
} from '../eval/failure-taxonomy';

// ─── Corpus well-formedness (Agent C) ────────────────────────────────────────

describe('real-conversation corpus', () => {
  it('is versioned and non-empty', () => {
    expect(CORPUS_VERSION).toBe('real-conv-v1');
    expect(realConversationCorpus.length).toBeGreaterThanOrEqual(9);
  });

  it('every case has seed turns and at least one query', () => {
    for (const scenario of realConversationCorpus) {
      expect(scenario.cases.length).toBeGreaterThan(0);
      for (const c of scenario.cases) {
        expect(c.seed.length).toBeGreaterThan(0);
        expect(c.queries.length).toBeGreaterThan(0);
        for (const t of c.seed) {
          expect(t.role).toBeTruthy();
          expect(typeof t.content).toBe('string');
        }
        for (const q of c.queries) {
          expect(typeof q.query).toBe('string');
          expect(Array.isArray(q.expectIncludes)).toBe(true);
        }
      }
    }
  });

  it('covers every declared difficulty category', () => {
    // Each category name appears as a substring of at least one scenario name.
    for (const cat of CORPUS_CATEGORIES) {
      expect(realConversationCorpus.some((s) => s.name.includes(cat))).toBe(true);
    }
  });

  it('every scenario has complete immutable metadata', () => {
    for (const s of realConversationCorpus) {
      const meta = corpusMetaFor(s.name);
      expect(meta, `missing metadata for ${s.name}`).not.toBeNull();
      expect(meta?.corpusVersion).toBe(CORPUS_VERSION);
      expect(['easy', 'medium', 'hard']).toContain(meta?.difficulty);
      expect(meta?.conversationLength).toBeGreaterThan(0);
      expect(['extractor', 'policy', 'retrieval', 'infrastructure']).toContain(
        meta?.expectedFailureCategory,
      );
    }
  });
});

// ─── Failure taxonomy exclusivity (Agent E) ──────────────────────────────────

describe('failure taxonomy', () => {
  it('assigns every sub-cause to exactly one category (mutual exclusivity)', () => {
    const seen = new Map<string, string>();
    for (const [category, subs] of Object.entries(FAILURE_SUBCAUSES)) {
      for (const sub of subs) {
        expect(seen.has(sub)).toBe(false); // no sub-cause appears twice
        seen.set(sub, category);
      }
    }
  });

  it('derives the category AND hierarchical ownership (team + area) from the sub-cause', () => {
    const r = classifyFailure('case_1', 'hallucinated_fact', 'invented residence', 'real-conv-v1');
    expect(r.category).toBe('extractor');
    expect(r.ownership).toEqual({ team: 'AI', area: 'Extraction' });
    expect(classifyFailure('c', 'threshold_miscalibration', 'e', 'v').ownership).toEqual({
      team: 'Memory',
      area: 'Policy',
    });
    expect(classifyFailure('c', 'embedding_quality', 'e', 'v').ownership).toEqual({
      team: 'Retrieval',
      area: 'Embedding',
    });
    expect(classifyFailure('c', 'malformed_llm_output', 'e', 'v').ownership.team).toBe('Platform');
  });

  it('every sub-cause has a hierarchical ownership mapping', () => {
    for (const subs of Object.values(FAILURE_SUBCAUSES)) {
      for (const sub of subs) {
        expect(SUBCAUSE_OWNERSHIP[sub], `no ownership for ${sub}`).toBeDefined();
        expect(SUBCAUSE_OWNERSHIP[sub]?.team).toBeTruthy();
        expect(SUBCAUSE_OWNERSHIP[sub]?.area).toBeTruthy();
      }
    }
  });

  it('category counts sum to the total (no double-counting)', () => {
    const records: FailureRecord[] = [
      classifyFailure('a', 'missed_fact', 'x', 'v'),
      classifyFailure('b', 'hallucinated_fact', 'x', 'v'),
      classifyFailure('c', 'wrong_pending', 'x', 'v'),
      classifyFailure('d', 'irrelevant_returned', 'x', 'v'),
      classifyFailure('e', 'llm_error_or_timeout', 'x', 'v'),
    ];
    const s = summarizeFailures(records);
    const sum =
      s.byCategory.extractor +
      s.byCategory.policy +
      s.byCategory.retrieval +
      s.byCategory.infrastructure;
    expect(sum).toBe(s.total);
    expect(s.byCategory.extractor).toBe(2);
  });
});
