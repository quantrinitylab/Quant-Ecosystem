// ============================================================================
// Answers module — AnswerEngine.ask (grounded generation with mandatory citations)
// quantmail-superhub · Task 16.1 (Requirements 8.2, 8.3, 18.1)
// ============================================================================
//
// PURPOSE
//   Implements the second half of the Perplexity-style answer engine
//   (design §"INTERFACE AnswerEngine"):
//
//       FUNCTION ask(userId, question, sources) RETURNS GroundedAnswer
//         PRECONDITION:  retrieval restricted to documents the user owns
//                        (authz filter)
//         POSTCONDITION: every claim maps to >=1 citation;
//                        empty-evidence -> "no answer found"
//
//   The AnswerEngine turns a user's natural-language question into a
//   {@link GroundedAnswer}: a textual answer whose EVERY claim is backed by at
//   least one {@link Citation} pointing at a chunk that was ACTUALLY retrieved
//   from the asking user's own corpora. It NEVER fabricates: when retrieval
//   yields no evidence it returns an explicit "no answer found" answer
//   (Requirement 8.3), and when the generator emits a claim citing a chunk that
//   was not retrieved, that claim is dropped rather than surfaced (citations are
//   never invented — Requirement 8.2).
//
// HOW THE GUARANTEES ARE ENFORCED
//   1. AUTHZ-SCOPED RETRIEVAL (precondition) — the engine never queries a store
//      itself; it goes through the {@link Retriever} (Task 15.1/15.2), which
//      already restricts retrieval to the asking user's OWN documents and
//      attaches provenance. The engine inherits that ownership guarantee.
//
//   2. NO EVIDENCE -> NO ANSWER (Req 8.3) — if the Retriever returns zero
//      chunks, the engine SHORT-CIRCUITS and returns a "no answer found"
//      GroundedAnswer (empty citations, zero confidence, no fabricated text).
//      Crucially this happens BEFORE any metered generation, so an unanswerable
//      question never spends an AI call or credits.
//
//   3. EVERY CLAIM IS CITED (Req 8.2) — the generation contract requires the
//      model to return its answer as a list of claims, each TAGGED with the
//      chunk id(s) that support it. The engine then VALIDATES every claim:
//        • a claim citing only chunk ids that were NOT retrieved is dropped
//          (we never manufacture a citation for an un-retrieved chunk), and
//        • each surviving claim's citations are rebuilt from the retrieved
//          chunk's own `chunkId` + provenance — so a citation can only ever
//          reference a real, retrieved, owned, attributable chunk.
//      If no claim survives validation, the engine again returns "no answer
//      found" rather than emitting an uncited answer.
//
//   4. METERED THROUGH THE USAGE GATE (Req 18.1) — grounded generation is a
//      `rag_query` cost driver. The engine reserves the query through the
//      billing {@link UsageGate} (consumed via the `modules/billing` barrel)
//      BEFORE generating and settles AFTER, so RAG queries are measurable and
//      FAIL CLOSED when the user is out of credits (the reserve step rejects
//      with `OUT_OF_CREDITS` and no AI call is made). If generation throws after
//      a successful reserve, the hold is released (settled at zero) so a failed
//      query is not billed.
//
// SEAMS / TESTABILITY
//   The retriever, the generation engine, and the usage gate are all injected
//   behind small structural ports ({@link RetrievePort}, {@link
//   GroundedGenerationPort}, {@link MeteringPort}). The concrete {@link
//   Retriever}, `@quant/ai`'s `UnifiedAIService`, and the billing `UsageGate`
//   all satisfy these shapes, but tests can inject in-memory fakes so the
//   citation-validation and fail-closed logic is unit-testable fully offline
//   (no live model, vector store, or wallet required). The grounded-answer
//   property test is Task 16.2.
//
// MODULE BOUNDARY
//   This module imports only neutral packages (`@quant/server-core`), its own
//   Retriever types, and the billing module's PUBLIC barrel (`../../billing`) —
//   mirroring how the agent module consumes billing. It does NOT import the mail
//   domain or QuantCode services directly, and it does NOT touch QuantChat.

import { createAppError } from '@quant/server-core';

import type {
  RankedChunk,
  SourceType,
  ChunkProvenance,
} from './retriever.service';

// Billing is consumed ONLY through its public barrel (module boundary), exactly
// like the agent module's usage-metering loop.
import type {
  UsageGate,
  MeteredAction,
  Reservation,
  Credits,
} from '../../billing';

// ---------------------------------------------------------------------------
// Output types (design §"STRUCTURE GroundedAnswer")
// ---------------------------------------------------------------------------

/**
 * Links one claim/span of the generated answer to a single source chunk that
 * was actually retrieved (Requirement 8.2). A citation can only ever reference
 * a real, retrieved, owned, attributable chunk — the engine rebuilds it from
 * the retrieved `RankedChunk`, never from raw model output.
 */
export interface Citation {
  /** The exact claim text this citation supports. */
  claim: string;
  /** The retrieved chunk's stable id (`RankedChunk.chunkId`). */
  chunkId: string;
  /** The chunk's corpus (email / repo / web). */
  sourceType: SourceType;
  /** Source attribution copied from the retrieved chunk (emailId / repo+path / url). */
  provenance: ChunkProvenance;
}

/**
 * The answer-engine's output (design `STRUCTURE GroundedAnswer`).
 * INVARIANT: when `text` is a substantive answer, `citations` is non-empty and
 * every claim in `text` maps to >=1 citation. When no evidence supports an
 * answer, `text` is the "no answer found" sentinel, `citations` is empty, and
 * `confidence` is 0 (Requirement 8.3).
 */
export interface GroundedAnswer {
  text: string;
  citations: Citation[];
  /** Calibrated confidence in [0, 1]; 0 for a "no answer found" result. */
  confidence: number;
}

/** The exact text returned when there is no evidence / nothing grounded to say. */
export const NO_ANSWER_FOUND_TEXT = 'No answer found.';

/** A GroundedAnswer expressing "no answer found" (Req 8.3): no text claims, no citations. */
export function noAnswerFound(): GroundedAnswer {
  return { text: NO_ANSWER_FOUND_TEXT, citations: [], confidence: 0 };
}

// ---------------------------------------------------------------------------
// Injectable ports (seams)
// ---------------------------------------------------------------------------

/**
 * Structural view of the {@link Retriever} (Task 15.1/15.2). Only the
 * authz-scoped `retrieve` entry point is needed; the concrete `Retriever`
 * satisfies this shape (its extra trailing options arg is irrelevant here).
 */
export interface RetrievePort {
  retrieve(
    userId: string,
    query: string,
    sources?: SourceType[],
    k?: number,
  ): Promise<RankedChunk[]>;
}

/** Options forwarded to the grounded generation engine. */
export interface GroundedGenerationOptions {
  systemPrompt?: string;
  userId?: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

/** The generator's result. Only `content` is required; `usage` is advisory. */
export interface GenerationResult {
  content: string;
  usage?: { input?: number; output?: number; total?: number };
}

/**
 * Structural view of `@quant/ai`'s `UnifiedAIService.generateText`. The concrete
 * service (which fails closed in production — Phase 1) satisfies this shape, so
 * the engine inherits that fail-closed property; tests inject a deterministic
 * fake.
 */
export interface GroundedGenerationPort {
  generateText(
    prompt: string,
    options?: GroundedGenerationOptions,
  ): Promise<GenerationResult>;
}

/**
 * Structural view of the billing {@link UsageGate} — the subset the answer
 * engine needs to meter a `rag_query` (reserve -> settle). The concrete
 * `UsageGate` satisfies this shape.
 */
export interface MeteringPort {
  estimateCost(action: MeteredAction): Credits;
  checkAndReserve(ownerRef: string, action: MeteredAction): Promise<Reservation>;
  settle(reservation: Reservation, actualCost: Credits): Promise<Reservation>;
}

// ---------------------------------------------------------------------------
// Engine deps + options
// ---------------------------------------------------------------------------

export interface AnswerEngineDeps {
  /** Authz-scoped retriever (precondition: restricts to the user's own docs). */
  retriever: RetrievePort;
  /** Grounded generation engine (`@quant/ai`, fail-closed in prod). */
  generator: GroundedGenerationPort;
  /** The credit metering gate — every `ask` reserves/settles a `rag_query` (Req 18.1). */
  gate: MeteringPort | UsageGate;
  /**
   * Idempotency-key generator for the metered `rag_query`. Each `ask` is a
   * distinct billable query, so the default produces a fresh random key;
   * override for deterministic tests.
   */
  generateActionKey?: (userId: string, question: string) => string;
  /** Default number of chunks to retrieve per question (override via {@link AskOptions.k}). */
  defaultK?: number;
}

/** Per-call options for {@link AnswerEngine.ask}. */
export interface AskOptions {
  /** Max chunks to retrieve for this question. Defaults to {@link AnswerEngineDeps.defaultK}. */
  k?: number;
  /** Sampling temperature for generation. Defaults to 0 (deterministic, grounded). */
  temperature?: number;
  /** Optional model id forwarded to the generator. */
  model?: string;
}

/** Default retrieval breadth for a question. */
export const DEFAULT_ANSWER_K = 8;

/** A single claim as emitted by the generator (before validation). */
interface GeneratedClaim {
  text: string;
  chunkIds: string[];
}

// ---------------------------------------------------------------------------
// AnswerEngine
// ---------------------------------------------------------------------------

export class AnswerEngine {
  private readonly retriever: RetrievePort;
  private readonly generator: GroundedGenerationPort;
  private readonly gate: MeteringPort;
  private readonly generateActionKey: (userId: string, question: string) => string;
  private readonly defaultK: number;

  constructor(deps: AnswerEngineDeps) {
    this.retriever = deps.retriever;
    this.generator = deps.generator;
    this.gate = deps.gate as MeteringPort;
    this.defaultK = deps.defaultK ?? DEFAULT_ANSWER_K;
    this.generateActionKey =
      deps.generateActionKey ??
      ((userId) => `rag_query:${userId}:${globalThis.crypto.randomUUID()}`);
  }

  /**
   * Answer `question` from the asking user's own corpora, with every claim
   * backed by >=1 citation.
   *
   * @param userId   the asking user — the authz key passed to the Retriever.
   * @param question the natural-language question.
   * @param sources  optional subset of corpora to search; defaults to all.
   * @param options  optional retrieval/generation tuning.
   *
   * @returns a {@link GroundedAnswer}. When retrieval finds no evidence, or no
   *   generated claim survives citation validation, returns {@link
   *   noAnswerFound} (Req 8.3) — never fabricated text or citations.
   *
   * @throws 400 USER_REQUIRED      when `userId` is empty.
   * @throws 400 QUESTION_REQUIRED  when `question` is empty/whitespace.
   * @throws 402 OUT_OF_CREDITS     (from the gate) when the user cannot fund the
   *   `rag_query` — the engine FAILS CLOSED and makes no AI call (Req 18.1).
   */
  async ask(
    userId: string,
    question: string,
    sources?: SourceType[],
    options?: AskOptions,
  ): Promise<GroundedAnswer> {
    // ----- 0. Validate inputs ---------------------------------------------
    if (typeof userId !== 'string' || userId.trim().length === 0) {
      throw createAppError('A userId is required to ask', 400, 'USER_REQUIRED');
    }
    if (typeof question !== 'string' || question.trim().length === 0) {
      throw createAppError('A non-empty question is required', 400, 'QUESTION_REQUIRED');
    }

    const k = Number.isInteger(options?.k) && (options!.k as number) > 0
      ? (options!.k as number)
      : this.defaultK;

    // ----- 1. Authz-scoped retrieval (precondition) -----------------------
    // The Retriever restricts to the user's OWN docs and attaches provenance.
    const chunks = await this.retriever.retrieve(userId, question, sources, k);

    // ----- 2. No evidence -> "no answer found" (Req 8.3) ------------------
    // Short-circuit BEFORE metering: an unanswerable question spends no AI call
    // and no credits, and we NEVER fabricate an answer.
    if (chunks.length === 0) {
      return noAnswerFound();
    }

    // ----- 3. Meter the rag_query (reserve -> generate -> settle) (Req 18.1)
    const action: MeteredAction = {
      actionKey: this.generateActionKey(userId, question),
      kind: 'rag_query',
      ownerRef: userId,
      units: 1,
      metadata: {
        questionLength: question.length,
        sources: sources ?? null,
        retrievedChunks: chunks.length,
      },
    };

    // FAIL CLOSED: rejects with OUT_OF_CREDITS / UPGRADE_REQUIRED before any AI
    // call when the user cannot fund the query.
    const reservation = await this.gate.checkAndReserve(userId, action);

    let generated: GenerationResult;
    try {
      const prompt = this.buildGroundedPrompt(question, chunks);
      generated = await this.generator.generateText(prompt, {
        systemPrompt: GROUNDED_SYSTEM_PROMPT,
        userId,
        temperature: options?.temperature ?? 0,
        model: options?.model,
      });
    } catch (err) {
      // Generation failed AFTER reserving: release the hold (bill nothing) so a
      // failed query is not charged, then propagate the error.
      await this.safeSettle(reservation, 0);
      throw err;
    }

    // Settle the (static per-query) cost now that the query ran.
    await this.safeSettle(reservation, this.gate.estimateCost(action));

    // ----- 4. Validate citations + assemble the grounded answer (Req 8.2) -
    return this.assembleGroundedAnswer(generated.content, chunks);
  }

  // -------------------------------------------------------------------------
  // Prompt construction
  // -------------------------------------------------------------------------

  /**
   * Build the grounded-generation prompt: the question plus the retrieved
   * chunks, each labelled with its exact `chunkId` and provenance, and a strict
   * instruction to answer ONLY from these sources and to cite each claim by
   * chunk id. The chunk ids the model sees are exactly the ones the engine will
   * validate against, so a well-behaved model can only cite retrieved chunks.
   */
  private buildGroundedPrompt(question: string, chunks: RankedChunk[]): string {
    const sourceBlock = chunks
      .map((c, i) => {
        const label = describeProvenance(c.provenance);
        return [
          `[#${i + 1}] chunkId: ${c.chunkId}`,
          `source: ${c.sourceType}${label ? ` (${label})` : ''}`,
          `text: ${c.text}`,
        ].join('\n');
      })
      .join('\n\n');

    return [
      'Answer the QUESTION using ONLY the SOURCES below.',
      'Every claim in your answer MUST be supported by at least one source, cited by its exact chunkId.',
      'Do not use any outside knowledge. If the sources do not contain the answer, return an empty "claims" array.',
      '',
      'Respond with STRICT JSON only (no prose, no markdown fences), of the form:',
      '{"claims":[{"text":"<one factual claim>","chunkIds":["<supporting chunkId>", ...]}],"confidence":<0..1>}',
      '',
      `QUESTION:\n${question}`,
      '',
      `SOURCES:\n${sourceBlock}`,
    ].join('\n');
  }

  // -------------------------------------------------------------------------
  // Citation validation + assembly (Req 8.2 / 8.3)
  // -------------------------------------------------------------------------

  /**
   * Parse the generator output into claims, then VALIDATE every claim against
   * the set of chunks that were actually retrieved. A claim that cites no
   * retrieved chunk is dropped (we never invent a citation); each surviving
   * claim's citations are rebuilt from the retrieved chunk's own id +
   * provenance. If nothing survives, returns {@link noAnswerFound} (Req 8.3).
   */
  private assembleGroundedAnswer(
    content: string,
    chunks: RankedChunk[],
  ): GroundedAnswer {
    const retrievedById = new Map<string, RankedChunk>();
    for (const c of chunks) retrievedById.set(c.chunkId, c);

    const parsed = parseGeneration(content);
    if (!parsed) return noAnswerFound();

    const citations: Citation[] = [];
    const acceptedClaims: string[] = [];

    for (const claim of parsed.claims) {
      const text = claim.text.trim();
      if (text.length === 0) continue;

      // Keep ONLY citations that reference an actually-retrieved chunk, de-duped.
      const seen = new Set<string>();
      const validChunks: RankedChunk[] = [];
      for (const id of claim.chunkIds) {
        if (typeof id !== 'string' || seen.has(id)) continue;
        const chunk = retrievedById.get(id);
        if (!chunk) continue; // fabricated / non-retrieved citation -> reject
        seen.add(id);
        validChunks.push(chunk);
      }

      // A claim with no valid citation is dropped (never surface uncited text).
      if (validChunks.length === 0) continue;

      acceptedClaims.push(text);
      for (const chunk of validChunks) {
        citations.push({
          claim: text,
          chunkId: chunk.chunkId,
          sourceType: chunk.sourceType,
          provenance: chunk.provenance,
        });
      }
    }

    // No claim survived validation -> no grounded answer (Req 8.3).
    if (acceptedClaims.length === 0) return noAnswerFound();

    return {
      text: acceptedClaims.join(' '),
      citations,
      confidence: resolveConfidence(parsed.confidence),
    };
  }

  // -------------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------------

  /** Settle a reservation, swallowing settle-time errors so they don't mask a result. */
  private async safeSettle(reservation: Reservation, actualCost: Credits): Promise<void> {
    try {
      await this.gate.settle(reservation, actualCost);
    } catch {
      // Settlement is best-effort reconciliation; never let it break `ask`.
    }
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers (pure)
// ---------------------------------------------------------------------------

/** System prompt enforcing grounded, citation-tagged, JSON-only generation. */
export const GROUNDED_SYSTEM_PROMPT =
  'You are a grounded answer engine. You answer strictly from the provided sources and ' +
  'attribute every claim to at least one source by its exact chunkId. You never use outside ' +
  'knowledge and never invent citations. If the sources do not support an answer, you return ' +
  'an empty claims array. You always respond with strict JSON only.';

/** Render a short human-readable provenance label for the prompt. */
function describeProvenance(p: ChunkProvenance): string {
  switch (p.kind) {
    case 'email':
      return `email ${p.emailId}`;
    case 'repo':
      return p.commit ? `${p.repo}/${p.path}@${p.commit}` : `${p.repo}/${p.path}`;
    case 'web':
      return p.url;
    default:
      return '';
  }
}

/** Clamp a model-reported confidence into [0, 1]; default to 0.5 when absent/invalid. */
function resolveConfidence(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0.5;
  return Math.min(1, Math.max(0, raw));
}

/**
 * Parse the generator's JSON output into a normalized claim list. Tolerates a
 * leading/trailing prose or markdown fence by extracting the outermost JSON
 * object. Returns `null` when the output cannot be parsed into the expected
 * shape — the caller then refuses to fabricate (returns "no answer found").
 */
function parseGeneration(
  content: string,
): { claims: GeneratedClaim[]; confidence: unknown } | null {
  if (typeof content !== 'string' || content.trim().length === 0) return null;

  const json = extractJsonObject(content);
  if (json == null) return null;

  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch {
    return null;
  }
  if (obj == null || typeof obj !== 'object') return null;

  const rawClaims = (obj as Record<string, unknown>)['claims'];
  if (!Array.isArray(rawClaims)) return null;

  const claims: GeneratedClaim[] = [];
  for (const entry of rawClaims) {
    if (entry == null || typeof entry !== 'object') continue;
    const rec = entry as Record<string, unknown>;
    const text = typeof rec['text'] === 'string' ? rec['text'] : '';
    const chunkIdsRaw = rec['chunkIds'];
    const chunkIds = Array.isArray(chunkIdsRaw)
      ? chunkIdsRaw.filter((x): x is string => typeof x === 'string')
      : [];
    claims.push({ text, chunkIds });
  }

  return { claims, confidence: (obj as Record<string, unknown>)['confidence'] };
}

/** Extract the outermost `{...}` JSON object substring from a string, or null. */
function extractJsonObject(content: string): string | null {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  return content.slice(start, end + 1);
}
