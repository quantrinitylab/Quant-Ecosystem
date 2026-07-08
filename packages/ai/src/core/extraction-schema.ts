// ============================================================================
// AI Core — Extraction Output Schema (PR-M11, frozen by ADR-010)
//
// The semantic contract every extractor (rule, GPT, Claude, local) emits.
// Kept separate from the storable MemoryCandidate: an ExtractedFact is semantic
// (slot/value/operation/polarity/subject/...), and `mapFactToCandidate` folds it
// into the frozen MemoryCandidate shape via metadata (ADR-008/009).
// ============================================================================

// bare 'crypto' (not 'node:crypto'): the node: scheme throws UnhandledSchemeError
// in Next.js/webpack when this module is reached via the @quant/ai barrel. Bare
// 'crypto' resolves on the server and tree-shakes out of client bundles.
import { createHash } from 'crypto';
import { asKind, asLevel } from './memory-port';
import type { MemoryCandidate } from './default-memory-extractor';

/** Structured evidence POINTER (ADR-010) — explainable, replayable, not brittle text. */
export interface Evidence {
  conversationId?: string;
  messageId?: string;
  turnIndex?: number;
  spanStart?: number;
  spanEnd?: number;
  extractor: string;
  /** Optional denormalized copy for display only. */
  quote?: string;
}

/** A semantic fact produced by an extractor. */
export interface ExtractedFact {
  slot: string;
  value: string;
  operation: 'store' | 'retract';
  polarity: 'positive' | 'negative';
  temporal: 'current' | 'transient' | 'past';
  confidence: number;
  /** Hierarchical 'family.detail' e.g. 'llm.gpt5', 'rule', 'user.explicit'. */
  provenance: string;
  /** WHO the fact is about. Only 'user' becomes the user's own memory. */
  subject: string;
  evidence: Evidence;
}

export interface ExtractionMetrics {
  model: string;
  latencyMs: number;
  tokens: number;
  costUsd: number;
}

export interface ExtractionResult {
  facts: ExtractedFact[];
  metrics: ExtractionMetrics;
}

/** Instrumented extractor: plain `extract` for the pipeline, `extractDetailed` for the eval. */
export interface InstrumentedExtractionModel {
  extract(
    actor: string,
    session: string,
    role: string,
    content: string,
  ): Promise<MemoryCandidate[]>;
  extractDetailed(
    actor: string,
    session: string,
    role: string,
    content: string,
  ): Promise<ExtractionResult>;
}

// ─── Trust resolution from hierarchical provenance ───────────────────────────

/** Default source-trust by provenance family (ADR-009/010). Override via policy. */
export const DEFAULT_TRUST_BY_FAMILY: Record<string, number> = {
  user: 1.0,
  rule: 1.0,
  import: 0.7,
  llm: 0.8,
  system: 0.5,
  web: 0.2,
};

export function trustForProvenance(
  provenance: string,
  table: Record<string, number> = DEFAULT_TRUST_BY_FAMILY,
): number {
  const family = provenance.split('.')[0] ?? '';
  return table[family] ?? 0.5;
}

// ─── Fingerprint (ADR-009 idempotency) ───────────────────────────────────────

export function fingerprintFact(owner: string, fact: ExtractedFact): string {
  const key = `${owner}:${fact.slot || fact.value}:${fact.value.trim().toLowerCase()}:${fact.operation}`;
  return createHash('sha1').update(key).digest('hex');
}

// ─── Slot → kind/level mapping ───────────────────────────────────────────────

function kindForSlot(slot: string): string {
  if (slot.startsWith('favourite:') || slot.startsWith('sentiment:')) return 'preference';
  return 'fact';
}

function levelForSlot(_slot: string): string {
  return 'user';
}

// ─── ExtractedFact → storable MemoryCandidate ────────────────────────────────

const TRANSIENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Map a semantic fact to a storable candidate. Returns null for facts that
 * should not be stored at all (past-tense values are not current facts).
 *
 * Anti-hallucination: a fact whose subject is NOT the user is stored under a
 * SUBJECT-SCOPED owner (`${userId}#${subject}`) so it is retained but NEVER
 * matches the user's own recall (actor = userId).
 */
export function mapFactToCandidate(
  fact: ExtractedFact,
  userId: string,
  trustTable: Record<string, number> = DEFAULT_TRUST_BY_FAMILY,
): MemoryCandidate | null {
  // "used to be X" is not a current fact — do not store as active memory.
  if (fact.temporal === 'past') return null;

  const isUser = fact.subject === 'user';
  const owner = isUser ? userId : `${userId}#${fact.subject}`;
  const trust = trustForProvenance(fact.provenance, trustTable);

  const metadata: Record<string, unknown> = {
    operation: fact.operation,
    slot: fact.slot,
    polarity: fact.polarity,
    temporal: fact.temporal,
    confidence: fact.confidence,
    provenance: fact.provenance,
    trust,
    subject: fact.subject,
    evidence: fact.evidence,
    fingerprint: fingerprintFact(owner, fact),
    extractor: 'llm',
  };

  return {
    content: fact.value,
    kind: asKind(kindForSlot(fact.slot)),
    level: asLevel(levelForSlot(fact.slot)),
    owner,
    pinned: false,
    expiresAt: fact.temporal === 'transient' ? Date.now() + TRANSIENT_TTL_MS : null,
    metadata,
  };
}
