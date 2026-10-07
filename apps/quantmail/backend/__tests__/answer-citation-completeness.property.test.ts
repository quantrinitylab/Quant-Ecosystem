// @vitest-environment node
// ============================================================================
// Task 16.2 — Property test: every answer claim has a citation
// quantmail-superhub · Phase 5 — Perplexity Answer Engine (Pillar 4)
// ============================================================================
//
// Feature: quantmail-superhub, Property 4: every answer claim has a citation
//
// **Property P4 (citation completeness)** — for ANY question with non-empty
// evidence, EVERY claim span in the returned `GroundedAnswer` maps to >= 1
// `Citation`, and every citation references an ACTUALLY-retrieved chunk (no
// fabricated citations). A claim that cited ONLY non-retrieved chunks never
// surfaces in the answer text. When evidence is empty, the engine yields
// "no answer found" (empty citations, zero confidence) — never fabricating.
//
// **Validates: Requirements 8.2, 8.3**
//   - 8.2 — the Answer_Engine attaches at least one Citation for every claim in
//           the answer.
//   - 8.3 — the Answer_Engine returns "no answer found" when retrieval yields no
//           evidence and never fabricates.
//
// HARNESS: tests the REAL `AnswerEngine.ask()` implementation from task 16.1
// (`modules/answers/services/answer-engine.service.ts`) against a funded, REAL
// billing `UsageGate` (`InMemoryBalanceProvider` with ample balance, so
// metering never blocks). The Retriever and the `@quant/ai` generator are
// exercised through in-memory fakes (a fixed retrieved corpus + a deterministic
// JSON generator) so the property targets the citation-validation / fail-closed
// logic — no network, no live model, no real wallet.
//
// Two properties are checked:
//   (P4-a) citation completeness over a RANDOM retrieved corpus and RANDOM
//          generator output whose claims cite arbitrary mixes of retrieved and
//          fabricated chunk ids; and
//   (P4-b) empty-evidence -> "no answer found" regardless of generator output.
//
// Library: fast-check (the ecosystem's JS property-testing tool), >= 100 runs
// per property.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  AnswerEngine,
  NO_ANSWER_FOUND_TEXT,
  type GenerationResult,
  type GroundedGenerationPort,
  type RetrievePort,
} from '../modules/answers/services/answer-engine.service';
import type { RankedChunk, SourceType } from '../modules/answers/services/retriever.service';
import { UsageGate, InMemoryBalanceProvider } from '../modules/billing';

// ---------------------------------------------------------------------------
// Test doubles (mirroring the existing answer-engine unit-test patterns)
// ---------------------------------------------------------------------------

const ASKING_USER = 'alice';

/** Build a retrieved, attributable chunk owned by the asking user. */
function ranked(chunkId: string, sourceType: SourceType, text: string): RankedChunk {
  const provenance =
    sourceType === 'email'
      ? ({ kind: 'email', emailId: `em-${chunkId}` } as const)
      : sourceType === 'repo'
        ? ({ kind: 'repo', repo: 'acme/api', path: `src/${chunkId}.ts` } as const)
        : ({ kind: 'web', url: `https://example.com/${chunkId}` } as const);
  return {
    chunkId,
    userId: ASKING_USER,
    sourceType,
    text,
    score: 1,
    retrievedBy: ['vector'],
    provenance,
  };
}

/** A retriever returning a fixed list (empty list simulates no evidence). */
function fakeRetriever(chunks: RankedChunk[]): RetrievePort {
  return {
    async retrieve() {
      return chunks;
    },
  };
}

/** A generator that returns a fixed JSON payload and counts its calls. */
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

/** A funded gate so metering never blocks (ample balance). */
function fundedGate(): UsageGate {
  return new UsageGate({
    balances: new InMemoryBalanceProvider({ initial: { [ASKING_USER]: 1_000_000 } }),
  });
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const sourceTypeArb = fc.constantFrom<SourceType>('email', 'repo', 'web');

/**
 * One generated claim spec. `valid` are ids drawn from the retrieved corpus;
 * `fabricated` are ids that were NOT retrieved (always `fab-*`, never `k-*`).
 * The claim's displayed text is assigned deterministically per-index in the
 * test so every claim text is distinct and non-substring of any other (the
 * `_` delimiter after the unique index prevents prefix collisions), keeping the
 * "appears / does not appear in answer text" assertions unambiguous.
 */
interface ClaimSpec {
  valid: string[];
  fabricated: string[];
  uuid: string;
}

const fabricatedIdArb = fc.integer({ min: 0, max: 50 }).map((n) => `fab-${n}`);

/**
 * A full scenario: a non-empty retrieved corpus (1..6 chunks) plus a list of
 * generated claims (0..6) each citing an arbitrary mix of retrieved + fabricated
 * chunk ids, and a model confidence in [0, 1].
 */
const scenarioArb = fc
  .array(sourceTypeArb, { minLength: 1, maxLength: 6 })
  .chain((sourceTypes) => {
    const chunkIds = sourceTypes.map((_, i) => `k-${i}`);
    const validIdArb = fc.constantFrom(...chunkIds);
    const claimArb: fc.Arbitrary<ClaimSpec> = fc.record({
      valid: fc.uniqueArray(validIdArb, { minLength: 0, maxLength: chunkIds.length }),
      fabricated: fc.array(fabricatedIdArb, { minLength: 0, maxLength: 3 }),
      uuid: fc.uuid(),
    });
    return fc.record({
      sourceTypes: fc.constant(sourceTypes),
      claims: fc.array(claimArb, { minLength: 0, maxLength: 6 }),
      confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    });
  });

/** A non-empty question string. */
const questionArb = fc
  .string({ minLength: 1, maxLength: 40 })
  .map((s) => `q ${s}`.trim());

// ---------------------------------------------------------------------------
// P4-a — citation completeness over a random corpus + random generator output
// ---------------------------------------------------------------------------

describe("Feature: quantmail-superhub, Property 4: every answer claim has a citation", () => {
  it('every claim in the returned answer maps to >= 1 citation referencing an actually-retrieved chunk; claims citing only non-retrieved chunks never appear (Req 8.2, 8.3)', async () => {
    await fc.assert(
      fc.asyncProperty(
        scenarioArb,
        questionArb,
        async (scenario, question) => {
          const { sourceTypes, claims, confidence } = scenario;

          // --- build the random retrieved corpus (all owned by the user) -----
          const chunks = sourceTypes.map((st, i) => ranked(`k-${i}`, st, `chunk text ${i}`));
          const retrievedIds = new Set(chunks.map((c) => c.chunkId));

          // --- build the generator's claim payload (text unique per index) ---
          const claimText = (i: number) => `C${i}_${claims[i]!.uuid}`;
          const payloadClaims = claims.map((spec, i) => ({
            text: claimText(i),
            // Interleave valid + fabricated; order is irrelevant to the engine.
            chunkIds: [...spec.valid, ...spec.fabricated],
          }));

          const generator = fakeGenerator({ claims: payloadClaims, confidence });
          const engine = new AnswerEngine({
            retriever: fakeRetriever(chunks),
            generator,
            gate: fundedGate(),
          });

          const answer = await engine.ask(ASKING_USER, question);

          // --- compute the EXPECTED surviving set --------------------------
          // A claim survives iff it cites >= 1 retrieved chunk (after dedup).
          // (All texts here are non-empty.)
          const expectedSurviving = claims
            .map((spec, i) => ({
              text: claimText(i),
              validDistinct: new Set(spec.valid.filter((id) => retrievedIds.has(id))),
            }))
            .filter((c) => c.validDistinct.size > 0);
          const droppedTexts = claims
            .map((_, i) => claimText(i))
            .filter((t) => !expectedSurviving.some((s) => s.text === t));

          // generation IS metered/called when evidence exists.
          expect(generator.calls).toBe(1);

          // === Case: nothing grounded survives -> "no answer found" (Req 8.3)
          if (expectedSurviving.length === 0) {
            expect(answer.text).toBe(NO_ANSWER_FOUND_TEXT);
            expect(answer.citations).toEqual([]);
            expect(answer.confidence).toBe(0);
            return;
          }

          // === Case: at least one grounded claim survives ==================
          expect(answer.text).not.toBe(NO_ANSWER_FOUND_TEXT);

          // (1) Every citation references an ACTUALLY-retrieved chunk — no
          //     fabricated citation ever appears (Req 8.2).
          for (const cite of answer.citations) {
            expect(retrievedIds.has(cite.chunkId)).toBe(true);
            expect(cite.chunkId.startsWith('fab-')).toBe(false);
          }

          // (2) The set of distinct cited claims is EXACTLY the surviving set —
          //     i.e. every surviving claim has >= 1 citation (completeness) and
          //     no dropped claim is cited.
          const citedClaimTexts = new Set(answer.citations.map((c) => c.claim));
          const expectedClaimTexts = new Set(expectedSurviving.map((s) => s.text));
          expect(citedClaimTexts).toEqual(expectedClaimTexts);

          // (3) Per surviving claim: appears in the answer text AND has exactly
          //     one citation per distinct retrieved chunk it cited.
          for (const s of expectedSurviving) {
            expect(answer.text.includes(s.text)).toBe(true);
            const citesForClaim = answer.citations.filter((c) => c.claim === s.text);
            expect(citesForClaim.length).toBe(s.validDistinct.size);
            // and each of those cites one of the distinct valid ids, no dupes.
            const citedIds = new Set(citesForClaim.map((c) => c.chunkId));
            expect(citedIds.size).toBe(citesForClaim.length);
            for (const id of citedIds) expect(s.validDistinct.has(id)).toBe(true);
          }

          // (4) Claims that cited ONLY non-retrieved chunks never surface.
          for (const t of droppedTexts) {
            expect(answer.text.includes(t)).toBe(false);
            expect(citedClaimTexts.has(t)).toBe(false);
          }

          // (5) Confidence is the (clamped) model confidence for a grounded answer.
          expect(answer.confidence).toBeCloseTo(confidence);
        },
      ),
      { numRuns: 200 },
    );
  });

  // -------------------------------------------------------------------------
  // P4-b — empty evidence -> "no answer found", regardless of generator output
  // -------------------------------------------------------------------------

  it('empty evidence yields "no answer found" with no citations / zero confidence, and never calls the generator, regardless of what it would produce (Req 8.3)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Whatever the generator WOULD have produced is irrelevant — it must be
        // short-circuited before any (metered) generation.
        scenarioArb,
        questionArb,
        async (scenario, question) => {
          const payloadClaims = scenario.claims.map((spec, i) => ({
            text: `C${i}_${spec.uuid}`,
            chunkIds: [...spec.valid, ...spec.fabricated],
          }));
          const generator = fakeGenerator({
            claims: payloadClaims,
            confidence: scenario.confidence,
          });

          const engine = new AnswerEngine({
            retriever: fakeRetriever([]), // <- NO evidence
            generator,
            gate: fundedGate(),
          });

          const answer = await engine.ask(ASKING_USER, question);

          expect(answer.text).toBe(NO_ANSWER_FOUND_TEXT);
          expect(answer.citations).toEqual([]);
          expect(answer.confidence).toBe(0);
          // No AI call / no metering spend on an unanswerable question.
          expect(generator.calls).toBe(0);
        },
      ),
      { numRuns: 200 },
    );
  });
});
