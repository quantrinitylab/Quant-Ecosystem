import { describe, it, expect, vi } from 'vitest';
import {
  AnswerEngine,
  NO_ANSWER_FOUND_TEXT,
  type GenerationResult,
  type GroundedGenerationPort,
  type RetrievePort,
} from '../modules/answers/services/answer-engine.service';
import type { RankedChunk, SourceType } from '../modules/answers/services/retriever.service';
import {
  UsageGate,
  InMemoryBalanceProvider,
  type MeteredAction,
} from '../modules/billing';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

function ranked(
  chunkId: string,
  userId: string,
  sourceType: SourceType,
  text: string,
): RankedChunk {
  const provenance =
    sourceType === 'email'
      ? ({ kind: 'email', emailId: `em-${chunkId}` } as const)
      : sourceType === 'repo'
        ? ({ kind: 'repo', repo: 'acme/api', path: `src/${chunkId}.ts` } as const)
        : ({ kind: 'web', url: `https://example.com/${chunkId}` } as const);
  return {
    chunkId,
    userId,
    sourceType,
    text,
    score: 1,
    retrievedBy: ['vector'],
    provenance,
  };
}

/** A retriever that returns a fixed list (or empty to simulate no evidence). */
function fakeRetriever(chunks: RankedChunk[]): RetrievePort {
  return {
    async retrieve() {
      return chunks;
    },
  };
}

/** A generator that returns a fixed JSON payload. */
function fakeGenerator(payload: unknown): GroundedGenerationPort & { calls: number } {
  const gen = {
    calls: 0,
    async generateText(): Promise<GenerationResult> {
      gen.calls += 1;
      return { content: JSON.stringify(payload) };
    },
  };
  return gen;
}

function gateWithBalance(userId: string, balance: number): UsageGate {
  return new UsageGate({
    balances: new InMemoryBalanceProvider({ initial: { [userId]: balance } }),
  });
}

const CHUNKS = [
  ranked('c1', 'alice', 'email', 'Q3 revenue grew 12%.'),
  ranked('c2', 'alice', 'repo', 'The billing service computes credits.'),
];

// ---------------------------------------------------------------------------
// Empty evidence -> "no answer found" (Requirement 8.3)
// ---------------------------------------------------------------------------

describe('AnswerEngine.ask — empty evidence (Req 8.3)', () => {
  it('returns "no answer found" with no citations and zero confidence when retrieval is empty', async () => {
    const generator = fakeGenerator({ claims: [], confidence: 0.9 });
    const gate = gateWithBalance('alice', 100);
    const engine = new AnswerEngine({ retriever: fakeRetriever([]), generator, gate });

    const answer = await engine.ask('alice', 'What was Q3 revenue?');

    expect(answer.text).toBe(NO_ANSWER_FOUND_TEXT);
    expect(answer.citations).toEqual([]);
    expect(answer.confidence).toBe(0);
  });

  it('does NOT call the generator (no AI spend) when there is no evidence', async () => {
    const generator = fakeGenerator({ claims: [], confidence: 1 });
    const gate = gateWithBalance('alice', 100);
    const engine = new AnswerEngine({ retriever: fakeRetriever([]), generator, gate });

    await engine.ask('alice', 'anything');

    expect(generator.calls).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Every claim is cited (Requirement 8.2)
// ---------------------------------------------------------------------------

describe('AnswerEngine.ask — grounded answers with citations (Req 8.2)', () => {
  it('attaches >=1 citation per claim, referencing actually-retrieved chunks', async () => {
    const generator = fakeGenerator({
      claims: [
        { text: 'Q3 revenue grew 12%.', chunkIds: ['c1'] },
        { text: 'Credits are computed by billing.', chunkIds: ['c1', 'c2'] },
      ],
      confidence: 0.8,
    });
    const engine = new AnswerEngine({
      retriever: fakeRetriever(CHUNKS),
      generator,
      gate: gateWithBalance('alice', 100),
    });

    const answer = await engine.ask('alice', 'Tell me about revenue and credits.');

    expect(answer.text).toContain('Q3 revenue grew 12%.');
    expect(answer.citations.length).toBeGreaterThanOrEqual(2);
    // Every citation references a chunk that was actually retrieved.
    const retrievedIds = new Set(CHUNKS.map((c) => c.chunkId));
    for (const cite of answer.citations) {
      expect(retrievedIds.has(cite.chunkId)).toBe(true);
    }
    // Every claim text appears in at least one citation (claim -> >=1 citation).
    const citedClaims = new Set(answer.citations.map((c) => c.claim));
    expect(citedClaims.has('Q3 revenue grew 12%.')).toBe(true);
    expect(citedClaims.has('Credits are computed by billing.')).toBe(true);
    expect(answer.confidence).toBeCloseTo(0.8);
  });

  it('drops a claim that cites only a non-retrieved chunk (never fabricates a citation)', async () => {
    const generator = fakeGenerator({
      claims: [
        { text: 'Grounded claim.', chunkIds: ['c1'] },
        { text: 'Hallucinated claim.', chunkIds: ['c-not-retrieved'] },
      ],
      confidence: 0.7,
    });
    const engine = new AnswerEngine({
      retriever: fakeRetriever(CHUNKS),
      generator,
      gate: gateWithBalance('alice', 100),
    });

    const answer = await engine.ask('alice', 'mixed');

    expect(answer.text).toContain('Grounded claim.');
    expect(answer.text).not.toContain('Hallucinated claim.');
    expect(answer.citations.every((c) => c.chunkId !== 'c-not-retrieved')).toBe(true);
  });

  it('returns "no answer found" when no generated claim survives citation validation', async () => {
    const generator = fakeGenerator({
      claims: [{ text: 'Uncited claim.', chunkIds: ['ghost'] }],
      confidence: 1,
    });
    const engine = new AnswerEngine({
      retriever: fakeRetriever(CHUNKS),
      generator,
      gate: gateWithBalance('alice', 100),
    });

    const answer = await engine.ask('alice', 'q');

    expect(answer.text).toBe(NO_ANSWER_FOUND_TEXT);
    expect(answer.citations).toEqual([]);
    expect(answer.confidence).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Metering through the UsageGate (Requirement 18.1)
// ---------------------------------------------------------------------------

describe('AnswerEngine.ask — metering (Req 18.1)', () => {
  it('reserves and settles a rag_query through the gate when evidence exists', async () => {
    const gate = gateWithBalance('alice', 100);
    const reserveSpy = vi.spyOn(gate, 'checkAndReserve');
    const settleSpy = vi.spyOn(gate, 'settle');
    const generator = fakeGenerator({
      claims: [{ text: 'Grounded.', chunkIds: ['c1'] }],
      confidence: 0.6,
    });
    const engine = new AnswerEngine({ retriever: fakeRetriever(CHUNKS), generator, gate });

    await engine.ask('alice', 'q');

    expect(reserveSpy).toHaveBeenCalledTimes(1);
    const action = reserveSpy.mock.calls[0]![1] as MeteredAction;
    expect(action.kind).toBe('rag_query');
    expect(settleSpy).toHaveBeenCalledTimes(1);
  });

  it('FAILS CLOSED: rejects and never calls the generator when the user is out of credits', async () => {
    const gate = gateWithBalance('alice', 0); // empty wallet
    const generator = fakeGenerator({
      claims: [{ text: 'Grounded.', chunkIds: ['c1'] }],
      confidence: 0.6,
    });
    const engine = new AnswerEngine({ retriever: fakeRetriever(CHUNKS), generator, gate });

    await expect(engine.ask('alice', 'q')).rejects.toMatchObject({ code: 'OUT_OF_CREDITS' });
    expect(generator.calls).toBe(0);
  });

  it('releases the reservation (settles at zero) when generation throws after reserving', async () => {
    const gate = gateWithBalance('alice', 100);
    const settleSpy = vi.spyOn(gate, 'settle');
    const throwingGenerator: GroundedGenerationPort = {
      async generateText() {
        throw new Error('provider unavailable');
      },
    };
    const engine = new AnswerEngine({
      retriever: fakeRetriever(CHUNKS),
      generator: throwingGenerator,
      gate,
    });

    await expect(engine.ask('alice', 'q')).rejects.toThrow('provider unavailable');
    expect(settleSpy).toHaveBeenCalledTimes(1);
    expect(settleSpy.mock.calls[0]![1]).toBe(0); // refunded
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe('AnswerEngine.ask — input validation', () => {
  it('rejects an empty userId', async () => {
    const engine = new AnswerEngine({
      retriever: fakeRetriever(CHUNKS),
      generator: fakeGenerator({ claims: [] }),
      gate: gateWithBalance('alice', 100),
    });
    await expect(engine.ask('', 'q')).rejects.toMatchObject({ code: 'USER_REQUIRED' });
  });

  it('rejects an empty question', async () => {
    const engine = new AnswerEngine({
      retriever: fakeRetriever(CHUNKS),
      generator: fakeGenerator({ claims: [] }),
      gate: gateWithBalance('alice', 100),
    });
    await expect(engine.ask('alice', '   ')).rejects.toMatchObject({ code: 'QUESTION_REQUIRED' });
  });
});
