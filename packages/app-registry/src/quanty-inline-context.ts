/**
 * QM-QUANTY-002 — Quanty inline context surfaces: evidence, context boundary,
 * preview-before-mutation, cost/reversibility, provenance.
 *
 * Source: docs/quant-architecture/task.md QM-QUANTY-002.
 *
 * This module is the contract layer. It builds ON the EC-01 capability
 * registry (risk tiers, approvals, cost meters — capability-types.ts) and the
 * EC-02 resource/context contract (QuantResourceRef, byte budgets —
 * resource-types.ts, context-envelope.ts). It does not duplicate them: every
 * decision here reads the capability descriptor as the source of truth.
 *
 * Design laws:
 *  1. Every Quanty output inside QuantMail carries evidence refs — each claim
 *     is traceable to a source mail/thread via QuantResourceRef.
 *  2. Quanty receives only governed minimum useful context: every inline call
 *     is measured against a byte budget and fails closed (or truncates
 *     oldest-first with an explicit flag) when over budget.
 *  3. No mutation without preview: any command of risk tier >= 2 executed
 *     through Quanty must first produce a MutationPreview the user can see.
 *  4. Cost is shown upfront from the capability's declared meter; every
 *     mutation records how it can be reversed (undo capability / token).
 *  5. Provenance is recorded for every output: who/what produced it, from
 *     which capability version, over how much context.
 */

import type { Capability, RiskTier } from './capability-types';
export type { Capability, RiskTier };
import {
  isResourceRef,
} from './resource-ref';
import type { QuantResourceRef } from './resource-types';
import { estimatePayloadBytes } from './context-envelope';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type QuantyContextErrorCode =
  | 'CONTEXT_OVER_BUDGET'
  | 'EVIDENCE_REF_INVALID'
  | 'PREVIEW_REQUIRED'
  | 'COST_QUOTE_UNAVAILABLE';

export class QuantyContextError extends Error {
  readonly code: QuantyContextErrorCode;
  readonly detail?: string;

  constructor(code: QuantyContextErrorCode, message: string, detail?: string) {
    super(message);
    this.name = 'QuantyContextError';
    this.code = code;
    this.detail = detail;
  }
}

// ---------------------------------------------------------------------------
// Evidence — every claim traceable to a source mail/thread
// ---------------------------------------------------------------------------

/** Maximum quote length kept inline; longer quotes are truncated, never dropped silently. */
export const EVIDENCE_QUOTE_MAX_CHARS = 280;

/**
 * A traceable pointer from a Quanty output back to the source that informed
 * it. The resourceRef is the EC-02 typed reference (e.g. mail.message);
 * the quote is a short verbatim span for display. A reference never grants
 * authorization — consumers must re-authorize at the owning product.
 */
export interface EvidenceRef {
  resourceRef: QuantResourceRef;
  /** Short human label, e.g. the source subject or sender. */
  label: string;
  /** Optional verbatim span from the source, capped at EVIDENCE_QUOTE_MAX_CHARS. */
  quote?: string;
  /** True when the quote was truncated to fit the cap. */
  quoteTruncated?: boolean;
}

export function createEvidenceRef(
  resourceRef: QuantResourceRef,
  label: string,
  quote?: string,
): EvidenceRef {
  if (!isResourceRef(resourceRef)) {
    throw new QuantyContextError(
      'EVIDENCE_REF_INVALID',
      'EvidenceRef requires a valid QuantResourceRef — evidence must never point at an untyped or fabricated source.',
    );
  }
  if (!label || !label.trim()) {
    throw new QuantyContextError('EVIDENCE_REF_INVALID', 'EvidenceRef requires a non-empty label.');
  }
  const ref: EvidenceRef = { resourceRef, label: label.trim() };
  if (quote && quote.trim()) {
    const clean = quote.trim();
    if (clean.length > EVIDENCE_QUOTE_MAX_CHARS) {
      ref.quote = `${clean.slice(0, EVIDENCE_QUOTE_MAX_CHARS - 1)}…`;
      ref.quoteTruncated = true;
    } else {
      ref.quote = clean;
    }
  }
  return ref;
}

export function isEvidenceRef(value: unknown): value is EvidenceRef {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    isResourceRef(v['resourceRef']) &&
    typeof v['label'] === 'string' &&
    (v['label'] as string).trim().length > 0
  );
}

// ---------------------------------------------------------------------------
// Provenance — who/what produced each output
// ---------------------------------------------------------------------------

export type ProvenanceProducer = 'quanty-model' | 'quanty-tool' | 'user' | 'system';

/**
 * Recorded for every Quanty output. Lets the user (and auditors) answer:
 * what produced this, through which capability version, over how much
 * context, and was that context truncated to fit the budget?
 */
export interface ProvenanceRecord {
  producedBy: ProvenanceProducer;
  /** Model identifier when producedBy is 'quanty-model'. */
  modelId?: string;
  capabilityId: string;
  capabilityVersion: number;
  /** ISO timestamp of production. */
  at: string;
  /** Bytes of context the producer actually received. */
  contextBytes: number;
  /** True when context was truncated oldest-first to fit the budget. */
  contextTruncated: boolean;
  /** Number of source messages/items the context contained. */
  sourceCount: number;
}

export function recordProvenance(input: {
  producedBy: ProvenanceProducer;
  capability: Pick<Capability, 'capabilityId' | 'version'>;
  modelId?: string;
  contextBytes: number;
  contextTruncated: boolean;
  sourceCount: number;
  at?: string;
}): ProvenanceRecord {
  if (input.contextBytes < 0 || !Number.isFinite(input.contextBytes)) {
    throw new QuantyContextError(
      'EVIDENCE_REF_INVALID',
      'Provenance requires a finite non-negative contextBytes measurement.',
    );
  }
  return {
    producedBy: input.producedBy,
    modelId: input.modelId,
    capabilityId: input.capability.capabilityId,
    capabilityVersion: input.capability.version,
    at: input.at ?? new Date().toISOString(),
    contextBytes: input.contextBytes,
    contextTruncated: input.contextTruncated,
    sourceCount: input.sourceCount,
  };
}

// ---------------------------------------------------------------------------
// Context boundary — governed minimum useful context
// ---------------------------------------------------------------------------

/**
 * Governed byte budget for one Quanty inline call inside QuantMail.
 * 32 KiB is enough for a subject + body + a handful of thread messages
 * (the "minimum useful context"); anything larger must be summarized or
 * windowed before it reaches the model. The model never receives unbounded
 * mailbox dumps.
 */
export const QUANTY_INLINE_CONTEXT_BUDGET_BYTES = 32 * 1024;

/** Per-risk-tier overrides; higher tiers may legitimately need more context. */
export const QUANTY_CONTEXT_BUDGET_BY_TIER: Record<RiskTier, number> = {
  0: QUANTY_INLINE_CONTEXT_BUDGET_BYTES,
  1: QUANTY_INLINE_CONTEXT_BUDGET_BYTES,
  2: 64 * 1024,
  3: 64 * 1024,
  4: 64 * 1024,
};

export function quantyContextBudgetFor(tier: RiskTier): number {
  return QUANTY_CONTEXT_BUDGET_BY_TIER[tier];
}

/**
 * Measure a candidate context payload and fail closed when it exceeds the
 * governed budget. Callers that prefer graceful degradation should catch
 * CONTEXT_OVER_BUDGET and truncate oldest-first, recording
 * contextTruncated: true in provenance.
 */
export function assertQuantyContextBudget(
  payload: unknown,
  maxBytes: number = QUANTY_INLINE_CONTEXT_BUDGET_BYTES,
): number {
  const bytes = estimatePayloadBytes(payload);
  if (bytes > maxBytes) {
    throw new QuantyContextError(
      'CONTEXT_OVER_BUDGET',
      `Quanty context payload is ${bytes} bytes; budget is ${maxBytes} bytes. Truncate oldest-first or narrow the source set.`,
      `bytes=${bytes} budget=${maxBytes}`,
    );
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Cost — shown upfront, from the capability's declared meter
// ---------------------------------------------------------------------------

/**
 * Upfront cost shown before a Quanty action runs. Credits are estimates
 * derived from the capability's meter unless the capability requires a live
 * quote (quoteRequired), in which case credits is 0 and the caller must
 * obtain a real quote from the meter before proceeding.
 */
export interface CostQuote {
  /** Estimated credits; 0 with quoteRequired=true means "fetch a live quote". */
  credits: number;
  meter: string;
  quoteRequired: boolean;
  /** False only when the number came from a live meter quote. */
  estimated: boolean;
}

/**
 * Conservative per-call credit estimates per meter. These are display
 * estimates so the user sees a cost before acting — not billing truth.
 * Billing truth lives with the economy ledger.
 */
export const CREDIT_ESTIMATES_BY_METER: Record<string, number> = {
  'ai.tokens': 2,
  'ai.tokens.large': 8,
  'mail.delivery': 1,
};

export function quoteCost(
  capability: Pick<Capability, 'capabilityId' | 'cost'>,
  opts: { liveQuoteCredits?: number } = {},
): CostQuote {
  const meter = capability.cost?.meter;
  if (!meter) {
    throw new QuantyContextError(
      'COST_QUOTE_UNAVAILABLE',
      `Capability ${capability.capabilityId} declares no cost meter — cannot show an upfront cost. Add a meter to the descriptor.`,
    );
  }
  if (capability.cost?.quoteRequired) {
    if (opts.liveQuoteCredits === undefined) {
      return { credits: 0, meter, quoteRequired: true, estimated: false };
    }
    return { credits: opts.liveQuoteCredits, meter, quoteRequired: true, estimated: false };
  }
  const credits = CREDIT_ESTIMATES_BY_METER[meter] ?? 1;
  return { credits, meter, quoteRequired: false, estimated: true };
}

// ---------------------------------------------------------------------------
// Preview before mutation — the user sees exactly what will change
// ---------------------------------------------------------------------------

/** One planned change inside a mutation preview. */
export interface PreviewChange {
  /** Human-readable description, e.g. 'Send to 2 recipients'. No invented data. */
  description: string;
  /** Machine-readable detail for the owning product's handler. */
  detail?: Record<string, unknown>;
}

/**
 * What the user reviews before a Quanty-driven mutation executes.
 * Built from the capability descriptor: approval requirement, cost and
 * reversibility are derived, never hand-written per call site.
 */
export interface MutationPreview {
  capabilityId: string;
  capabilityVersion: number;
  summary: string;
  changes: PreviewChange[];
  /** Whether the capability's risk tier requires explicit approval. */
  requiresApproval: boolean;
  approvalReason?: string;
  cost: CostQuote;
  /** How this mutation can be reversed. */
  reversibility: {
    reversible: boolean;
    /** Capability id that reverses it (e.g. an undo capability), when known. */
    undoCapabilityId?: string;
    /** Opaque token the executor can use to reverse this exact mutation. */
    undoToken?: string;
    note: string;
  };
  /** Idempotency key the execution must carry (registry law: commands are idempotent). */
  idempotencyKey: string;
  createdAt: string;
}

/**
 * Preview is required for commands of risk tier >= 2: low-risk reversible
 * actions and everything above. Tier 0 reads and tier 1 drafts never mutate
 * external state, so they don't need a preview step.
 */
export function requiresPreview(capability: Pick<Capability, 'kind' | 'riskTier'>): boolean {
  return capability.kind === 'command' && capability.riskTier >= 2;
}

function newIdempotencyKey(randomSource?: () => string): string {
  if (randomSource) return randomSource();
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `qm-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function buildMutationPreview(input: {
  capability: Capability;
  summary: string;
  changes: PreviewChange[];
  reversibility: MutationPreview['reversibility'];
  idempotencyKey?: string;
  randomSource?: () => string;
  liveQuoteCredits?: number;
}): MutationPreview {
  const { capability } = input;
  if (!requiresPreview(capability)) {
    throw new QuantyContextError(
      'PREVIEW_REQUIRED',
      `Capability ${capability.capabilityId} (tier ${capability.riskTier}) does not require a mutation preview — do not fabricate one.`,
    );
  }
  if (input.changes.length === 0) {
    throw new QuantyContextError(
      'PREVIEW_REQUIRED',
      'A mutation preview must list at least one planned change — an empty preview hides the mutation.',
    );
  }
  return {
    capabilityId: capability.capabilityId,
    capabilityVersion: capability.version,
    summary: input.summary,
    changes: input.changes,
    requiresApproval: capability.approval.required || capability.riskTier >= 3,
    approvalReason: capability.approval.reason,
    cost: quoteCost(capability, { liveQuoteCredits: input.liveQuoteCredits }),
    reversibility: input.reversibility,
    idempotencyKey: input.idempotencyKey ?? newIdempotencyKey(input.randomSource),
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Output envelope — the standard wrapper for every Quanty output in mail
// ---------------------------------------------------------------------------

/**
 * Standard envelope for Quanty outputs inside QuantMail: the output itself,
 * its evidence refs, its provenance, and its cost. UI renders evidence +
 * cost from this envelope; it never invents them.
 */
export interface QuantyOutputEnvelope<TOutput> {
  output: TOutput;
  evidence: EvidenceRef[];
  provenance: ProvenanceRecord;
  cost?: CostQuote;
}

export function buildOutputEnvelope<TOutput>(input: {
  output: TOutput;
  evidence: EvidenceRef[];
  provenance: ProvenanceRecord;
  cost?: CostQuote;
}): QuantyOutputEnvelope<TOutput> {
  return {
    output: input.output,
    evidence: input.evidence,
    provenance: input.provenance,
    cost: input.cost,
  };
}
