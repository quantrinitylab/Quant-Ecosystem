import { describe, it, expect, vi } from 'vitest';
import {
  DefaultMemoryExtractor,
  FactExtractor,
  PreferenceExtractor,
  EntityExtractor,
  EpisodicExtractor,
  AcknowledgementIgnoreFilter,
  RoleIgnoreFilter,
  ContentDuplicateFilter,
  TurnCountSummarizerTrigger,
  NegationExtractor,
  type ExtractionInput,
  type ExtractionModel,
  type MemoryCandidate,
} from '../core/default-memory-extractor';

const at = (content: string, role = 'user'): ExtractionInput => ({
  actor: 'user_1',
  session: 's1',
  role,
  content,
});

// ─── End-to-end pipeline behavior (the examples from the spec) ─────────────────

describe('DefaultMemoryExtractor pipeline', () => {
  const ex = new DefaultMemoryExtractor();

  it('"I live in Patna." → a fact', async () => {
    const out = await ex.extract('user_1', 's1', 'user', 'I live in Patna.');
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('fact');
    expect(out[0]?.content).toBe('lives in Patna');
    expect(out[0]?.owner).toBe('user_1');
  });

  it('"My favourite language is Rust." → a preference', async () => {
    const out = await ex.extract('user_1', 's1', 'user', 'My favourite language is Rust.');
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('preference');
    expect(out[0]?.content).toBe('favourite language is Rust');
  });

  it('"Thanks!" → ignored (no candidates)', async () => {
    expect(await ex.extract('user_1', 's1', 'user', 'Thanks!')).toEqual([]);
  });

  it('ignores non-user roles by default', async () => {
    expect(await ex.extract('user_1', 's1', 'assistant', 'I live in Patna.')).toEqual([]);
  });

  it('tags provenance in metadata', async () => {
    const out = await ex.extract('user_1', 's1', 'user', 'I like hiking');
    expect(out[0]?.metadata).toMatchObject({ extractor: 'preference', session: 's1' });
  });
});

// ─── Individual extractors ─────────────────────────────────────────────────────

describe('FactExtractor', () => {
  const f = new FactExtractor();
  it('captures name and workplace', () => {
    expect(f.extract(at('My name is Kundan')).map((c) => c.content)).toContain('name is Kundan');
    expect(f.extract(at('I work at OpenAI')).map((c) => c.content)).toContain('works at OpenAI');
  });
  it('returns nothing for a plain sentence', () => {
    expect(f.extract(at('The weather is nice today'))).toEqual([]);
  });
});

describe('PreferenceExtractor', () => {
  const p = new PreferenceExtractor();
  it('captures likes and dislikes', () => {
    expect(p.extract(at('I love coffee')).map((c) => c.content)).toContain('likes coffee');
    expect(p.extract(at('I hate mornings')).map((c) => c.content)).toContain('dislikes mornings');
  });
});

describe('EntityExtractor', () => {
  const e = new EntityExtractor();
  it('captures a third-person relationship with structured metadata', () => {
    const out = e.extract(at('Alice works at OpenAI'));
    expect(out).toHaveLength(1);
    expect(out[0]?.content).toBe('Alice works at OpenAI');
    expect(out[0]?.metadata).toMatchObject({
      relation: 'works_at',
      subject: 'Alice',
      object: 'OpenAI',
    });
  });
  it('does not fire on first-person (that is a fact, not an entity relation)', () => {
    expect(e.extract(at('I work at OpenAI'))).toEqual([]);
  });
});

describe('EpisodicExtractor', () => {
  const ep = new EpisodicExtractor();
  it('fires on temporal cues', () => {
    const out = ep.extract(at('Yesterday I met Sarah for lunch'));
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('episodic');
    expect(out[0]?.level).toBe('conversation');
  });
  it('ignores non-episodic content', () => {
    expect(ep.extract(at('I like pizza'))).toEqual([]);
  });
});

// ─── Filters ─────────────────────────────────────────────────────────────────

describe('NegationExtractor', () => {
  const n = new NegationExtractor();
  it('emits a residence retract intent for "I don\'t live in X anymore"', () => {
    const out = n.extract(at("I don't live in Patna anymore"));
    expect(out).toHaveLength(1);
    expect(out[0]?.metadata).toMatchObject({ operation: 'retract', slot: 'residence' });
  });
  it('emits an employer retract intent for departure verbs', () => {
    expect(n.extract(at('I left Google'))[0]?.metadata).toMatchObject({
      operation: 'retract',
      slot: 'employer',
    });
  });
  it('emits nothing for a plain positive statement', () => {
    expect(n.extract(at('I live in Patna'))).toEqual([]);
  });
});

describe('AcknowledgementIgnoreFilter', () => {
  const f = new AcknowledgementIgnoreFilter();
  it.each(['thanks', 'Thank you!', 'ok', 'cool', 'lol', '   '])('ignores "%s"', (c) => {
    expect(f.shouldIgnore(at(c))).toBe(true);
  });
  it('does not ignore meaningful content', () => {
    expect(f.shouldIgnore(at('I live in Patna'))).toBe(false);
  });
});

describe('RoleIgnoreFilter', () => {
  it('ignores roles outside the remember list', () => {
    const f = new RoleIgnoreFilter(['user']);
    expect(f.shouldIgnore(at('x', 'assistant'))).toBe(true);
    expect(f.shouldIgnore(at('x', 'user'))).toBe(false);
  });
});

describe('ContentDuplicateFilter', () => {
  it('collapses identical normalized content of the same kind', () => {
    const dup: MemoryCandidate[] = [
      {
        content: 'likes coffee',
        kind: 'preference' as never,
        level: 'user' as never,
        owner: 'u',
        pinned: false,
        expiresAt: null,
        metadata: {},
      },
      {
        content: 'Likes   coffee',
        kind: 'preference' as never,
        level: 'user' as never,
        owner: 'u',
        pinned: false,
        expiresAt: null,
        metadata: {},
      },
    ];
    expect(new ContentDuplicateFilter().filter(dup)).toHaveLength(1);
  });
});

// ─── Model-agnostic extraction ─────────────────────────────────────────────────

describe('ExtractionModel integration', () => {
  it('merges model candidates with rule-based ones and dedupes across both', async () => {
    const model: ExtractionModel = {
      extract: vi.fn(
        async (input: ExtractionInput): Promise<MemoryCandidate[]> => [
          {
            content: 'lives in Patna',
            kind: 'fact' as never,
            level: 'user' as never,
            owner: input.actor,
            pinned: false,
            expiresAt: null,
            metadata: { extractor: 'llm' },
          },
          {
            content: 'is learning systems design',
            kind: 'fact' as never,
            level: 'user' as never,
            owner: input.actor,
            pinned: false,
            expiresAt: null,
            metadata: { extractor: 'llm' },
          },
        ],
      ),
    };
    const ex = new DefaultMemoryExtractor({ model });
    const out = await ex.extract('user_1', 's1', 'user', 'I live in Patna.');
    // rule-based produced "lives in Patna"; model produced the same + one more.
    // The duplicate is collapsed → 2 unique candidates.
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.content).sort()).toEqual([
      'is learning systems design',
      'lives in Patna',
    ]);
    expect(model.extract).toHaveBeenCalledOnce();
  });

  it('does not call the model for ignored turns', async () => {
    const model: ExtractionModel = { extract: vi.fn(async () => []) };
    const ex = new DefaultMemoryExtractor({ model });
    await ex.extract('user_1', 's1', 'user', 'thanks!');
    expect(model.extract).not.toHaveBeenCalled();
  });
});

// ─── SummarizerTrigger ─────────────────────────────────────────────────────────

describe('TurnCountSummarizerTrigger', () => {
  it('fires every N turns', () => {
    const t = new TurnCountSummarizerTrigger(200);
    expect(t.shouldSummarize(199)).toBe(false);
    expect(t.shouldSummarize(200)).toBe(true);
    expect(t.shouldSummarize(400)).toBe(true);
    expect(t.shouldSummarize(0)).toBe(false);
  });

  it('is exposed through the extractor facade', () => {
    const ex = new DefaultMemoryExtractor({
      summarizerTrigger: new TurnCountSummarizerTrigger(10),
    });
    expect(ex.shouldSummarize(10, at('x'))).toBe(true);
    expect(ex.shouldSummarize(5, at('x'))).toBe(false);
  });

  it('defaults to false when no trigger is configured', () => {
    const ex = new DefaultMemoryExtractor();
    expect(ex.shouldSummarize(1000, at('x'))).toBe(false);
  });
});
