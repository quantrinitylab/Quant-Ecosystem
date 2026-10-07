// ============================================================================
// Billing module — PricingEngine (cost driver -> credits)
// quantmail-superhub · Task 13.1 (Requirements 18.1, 18.5)
// ============================================================================
//
// PURPOSE
//   Implements the design's `PricingEngine` (design §"Billing/Credits") — the
//   component that maps a **cost driver** (AI tokens, an email message, a RAG
//   query, a CI minute, storage, an agent-org run) into a **credit cost**:
//
//       PricingEngine: cost driver -> credits
//       (@quant/ai cost tracker:  tokens -> $ -> credits)
//
//   The single most important responsibility is deriving the **AI inference**
//   rate from the existing `@quant/ai` cost tracker rather than inventing a new
//   price table: the model router already holds the canonical per-token dollar
//   rates that `CostTracker`/`RequestCostLogger` record, so the PricingEngine
//   reads those rates (`tokens -> $`) and converts dollars to credits with a
//   single `creditsPerUsd` factor (`$ -> credits`). This keeps metering honest
//   and avoids a second, drifting source of truth.
//
//   This is the EARLY metering hook described in the design's metering-placement
//   note: the PricingEngine + UsageGate choke point land **now**, alongside the
//   agent layer (Phase 4). The full `CreditWallet`/append-only ledger, plans,
//   payments, and daily resets are Phase 7 (tasks 25–31). Every seam here is
//   injectable so Phase 7 can swap real implementations in without touching
//   call sites.

import type { ModelRouter } from '@quant/ai';

// ---------------------------------------------------------------------------
// Domain primitives
// ---------------------------------------------------------------------------

/** A credit amount (whole credits; never negative). */
export type Credits = number;

/**
 * The metered cost drivers (design `PricingRule.actionKind`). AI inference is
 * priced from the `@quant/ai` cost tracker; the rest are simple per-unit
 * placeholders until Phase 7 tunes them.
 */
export type ActionKind =
  | 'ai_inference'
  | 'agent_org_run'
  | 'email_send'
  | 'rag_query'
  | 'ci_minute'
  | 'storage_gb_day';

/** The unit a {@link PricingRule} prices (design `PricingRule.unit`). */
export type PricingUnit =
  | 'per_1k_tokens'
  | 'per_message'
  | 'per_query'
  | 'per_minute'
  | 'per_gb_day'
  | 'per_run';

/**
 * Where a rule's price comes from. `quant_ai_cost_tracker` means the rate is
 * derived from the `@quant/ai` per-token cost table at estimate time; `static`
 * means a fixed `creditsPerUnit`.
 */
export type PricingSource = 'quant_ai_cost_tracker' | 'static';

/** Projected/actual token split for an AI inference (design `tokens -> $`). */
export interface TokenUsage {
  input?: number;
  output?: number;
}

/**
 * A unit of metered work submitted to the gate. `actionKey` is the idempotency
 * key used by {@link CreditMeter.checkAndReserve}/`settle` so retries never
 * double-charge.
 */
export interface MeteredAction {
  /** Idempotency key — a hold/debit is recorded at most once per key. */
  actionKey: string;
  /** Which cost driver this action exercises. */
  kind: ActionKind;
  /** Owner the cost is billed to (optional convenience; the gate also takes it explicitly). */
  ownerRef?: string;
  /** For `ai_inference`: the model the inference will run on (rate lookup). */
  modelId?: string;
  /** For `ai_inference`: a coarse model tier when no concrete `modelId` is known. */
  modelClass?: string;
  /**
   * For `ai_inference`: projected token usage read from the `@quant/ai` cost
   * tracker/token counter. Used to estimate cost BEFORE the call runs.
   */
  projectedTokens?: TokenUsage;
  /** For non-AI drivers: count of messages / queries / minutes / gb-days / runs. */
  units?: number;
  /** Free-form audit metadata (never affects pricing). */
  metadata?: Record<string, unknown>;
}

/**
 * A pricing rule mapping one cost driver to a credit cost (design
 * `STRUCTURE PricingRule`, a.k.a. `CreditCost`).
 */
export interface PricingRule {
  actionKind: ActionKind;
  unit: PricingUnit;
  /**
   * Credits charged per unit. For `ai_inference` (source
   * `quant_ai_cost_tracker`) this is a **markup multiplier** applied on top of
   * the cost-tracker-derived credit cost (default `1` = pass-through). For
   * `static` rules it is the flat credits-per-unit.
   */
  creditsPerUnit: Credits;
  /** For `ai_inference`, the rate may vary by model tier. */
  modelClass?: string;
  source: PricingSource;
}

// ---------------------------------------------------------------------------
// AI cost estimator (the @quant/ai cost tracker bridge: tokens -> $)
// ---------------------------------------------------------------------------

/** Token counts for a single AI inference, with optional model selection. */
export interface AiUsage extends TokenUsage {
  modelId?: string;
  modelClass?: string;
}

/**
 * Bridges the PricingEngine to the `@quant/ai` cost tracker. The default
 * implementation reads the per-token dollar rates the model router publishes —
 * the very rates `CostTracker`/`RequestCostLogger` use to record spend — so the
 * credit price tracks the real provider cost.
 */
export interface AiCostEstimator {
  /** tokens -> $ : the dollar cost of the given token usage on a model. */
  estimateUsd(usage: AiUsage): number;
  /** Blended $ per 1k tokens for a model (used to publish an inspectable rule). */
  usdPer1kTokens(modelId?: string, modelClass?: string): number;
}

/** Fallback per-token rates when a model id is unknown (≈ gpt-4o-mini tier). */
const FALLBACK_INPUT_RATE = 0.00000015;
const FALLBACK_OUTPUT_RATE = 0.0000006;

export interface ModelRouterCostEstimatorOptions {
  /** Model used when an action does not specify a routable `modelId`. */
  defaultModelId?: string;
  /**
   * Output:total token ratio used only to publish a *blended* per-1k rate via
   * {@link AiCostEstimator.usdPer1kTokens}. Estimation of a concrete action
   * always uses the precise input/output split and never this ratio.
   */
  blendOutputRatio?: number;
}

/**
 * Build an {@link AiCostEstimator} backed by a `@quant/ai` {@link ModelRouter}.
 * The router's `AIModelConfig.costPerInputToken`/`costPerOutputToken` are the
 * canonical token→$ rates used across the AI engine, so pricing derives from
 * the same source the cost tracker records against (design: "AI rates derive
 * from the `@quant/ai` cost tracker").
 */
export function createModelRouterCostEstimator(
  router: ModelRouter,
  options: ModelRouterCostEstimatorOptions = {},
): AiCostEstimator {
  const defaultModelId = options.defaultModelId ?? 'gpt-4o-mini';
  const blendOutputRatio = clamp01(options.blendOutputRatio ?? 0.5);

  function rates(modelId?: string): { input: number; output: number } {
    const models = router.getModels();
    const wanted = modelId ?? defaultModelId;
    const match =
      models.find((m) => m.id === wanted) ?? models.find((m) => m.id === defaultModelId);
    if (!match) {
      return { input: FALLBACK_INPUT_RATE, output: FALLBACK_OUTPUT_RATE };
    }
    return { input: match.costPerInputToken, output: match.costPerOutputToken };
  }

  return {
    estimateUsd(usage) {
      const { input, output } = rates(usage.modelId);
      const inTokens = nonNegative(usage.input);
      const outTokens = nonNegative(usage.output);
      return inTokens * input + outTokens * output;
    },
    usdPer1kTokens(modelId) {
      const { input, output } = rates(modelId);
      const perToken = input * (1 - blendOutputRatio) + output * blendOutputRatio;
      return perToken * 1000;
    },
  };
}

/**
 * A static {@link AiCostEstimator} for environments that do not construct a
 * model router (tests, isolated unit checks). Uses the same fallback tier rates
 * as the router-backed estimator.
 */
export const fallbackAiCostEstimator: AiCostEstimator = {
  estimateUsd(usage) {
    return (
      nonNegative(usage.input) * FALLBACK_INPUT_RATE +
      nonNegative(usage.output) * FALLBACK_OUTPUT_RATE
    );
  },
  usdPer1kTokens() {
    return (FALLBACK_INPUT_RATE + FALLBACK_OUTPUT_RATE) * 0.5 * 1000;
  },
};

// ---------------------------------------------------------------------------
// PricingEngine
// ---------------------------------------------------------------------------

/** Default credits granted per US dollar of provider spend ($1 == 1000 credits). */
export const DEFAULT_CREDITS_PER_USD = 1000;

/** Default static rules for the non-AI cost drivers (Phase-7 will tune these). */
const DEFAULT_RULES: PricingRule[] = [
  {
    actionKind: 'ai_inference',
    unit: 'per_1k_tokens',
    creditsPerUnit: 1,
    source: 'quant_ai_cost_tracker',
  },
  { actionKind: 'email_send', unit: 'per_message', creditsPerUnit: 1, source: 'static' },
  { actionKind: 'rag_query', unit: 'per_query', creditsPerUnit: 5, source: 'static' },
  { actionKind: 'ci_minute', unit: 'per_minute', creditsPerUnit: 2, source: 'static' },
  { actionKind: 'agent_org_run', unit: 'per_run', creditsPerUnit: 50, source: 'static' },
  { actionKind: 'storage_gb_day', unit: 'per_gb_day', creditsPerUnit: 1, source: 'static' },
];

export interface PricingEngineOptions {
  /** Override/extend the default rules (matched by `actionKind` + optional `modelClass`). */
  rules?: PricingRule[];
  /** Dollars -> credits conversion factor. Defaults to {@link DEFAULT_CREDITS_PER_USD}. */
  creditsPerUsd?: number;
  /**
   * The AI cost bridge. Defaults to {@link fallbackAiCostEstimator}; production
   * wiring injects {@link createModelRouterCostEstimator} so AI rates track the
   * live `@quant/ai` cost tracker.
   */
  aiCost?: AiCostEstimator;
}

/**
 * Maps cost drivers to credits.
 *
 *   estimateCost(action) -> Credits
 *     POSTCONDITION: cost derived from the active PricingRule for action.kind
 *       (AI: projected tokens × rate from the @quant/ai cost tracker;
 *        mail: per-message; CI: per-minute; etc.)
 */
export class PricingEngine {
  private readonly rules: Map<string, PricingRule>;
  private readonly creditsPerUsd: number;
  private readonly aiCost: AiCostEstimator;

  constructor(options: PricingEngineOptions = {}) {
    this.creditsPerUsd = options.creditsPerUsd ?? DEFAULT_CREDITS_PER_USD;
    this.aiCost = options.aiCost ?? fallbackAiCostEstimator;
    this.rules = new Map();
    for (const rule of [...DEFAULT_RULES, ...(options.rules ?? [])]) {
      this.rules.set(ruleKey(rule.actionKind, rule.modelClass), rule);
    }
  }

  /** Resolve the active rule for an action (model-class-specific rule wins). */
  getRule(kind: ActionKind, modelClass?: string): PricingRule {
    return (
      (modelClass ? this.rules.get(ruleKey(kind, modelClass)) : undefined) ??
      this.rules.get(ruleKey(kind)) ??
      DEFAULT_RULES.find((r) => r.actionKind === kind)!
    );
  }

  /**
   * Estimate the credit cost of an action.
   *
   * AI inference is priced from the `@quant/ai` cost tracker:
   * `tokens -> $ -> credits = ceil(usd × creditsPerUsd × markup)`. Every other
   * driver is `ceil(units × rule.creditsPerUnit)`. The result is always a
   * non-negative whole number of credits.
   */
  estimateCost(action: MeteredAction): Credits {
    const rule = this.getRule(action.kind, action.modelClass);

    if (rule.actionKind === 'ai_inference' && rule.source === 'quant_ai_cost_tracker') {
      const usd = this.aiCost.estimateUsd({
        modelId: action.modelId,
        modelClass: action.modelClass,
        input: nonNegative(action.projectedTokens?.input),
        output: nonNegative(action.projectedTokens?.output),
      });
      const markup = rule.creditsPerUnit > 0 ? rule.creditsPerUnit : 1;
      return toCredits(usd * this.creditsPerUsd * markup);
    }

    // Per-unit drivers (and any statically-priced ai_inference override).
    const units = action.units == null ? 1 : nonNegative(action.units);
    return toCredits(units * rule.creditsPerUnit);
  }

  /**
   * Publish an inspectable `ai_inference` {@link PricingRule} whose
   * `creditsPerUnit` reflects the cost-tracker-derived **credits per 1k tokens**
   * for a model. This makes the AI rate transparent/auditable even though
   * {@link estimateCost} computes the precise input/output dollars directly.
   */
  deriveAiInferenceRule(modelId?: string, modelClass?: string): PricingRule {
    const base = this.getRule('ai_inference', modelClass);
    const markup = base.creditsPerUnit > 0 ? base.creditsPerUnit : 1;
    const creditsPer1k = toCredits(
      this.aiCost.usdPer1kTokens(modelId, modelClass) * this.creditsPerUsd * markup,
    );
    return {
      actionKind: 'ai_inference',
      unit: 'per_1k_tokens',
      creditsPerUnit: creditsPer1k,
      modelClass: modelClass ?? base.modelClass,
      source: 'quant_ai_cost_tracker',
    };
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function ruleKey(kind: ActionKind, modelClass?: string): string {
  return modelClass ? `${kind}::${modelClass}` : kind;
}

function nonNegative(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

/** Round a raw credit amount up to a non-negative whole number of credits. */
function toCredits(raw: number): Credits {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.ceil(raw);
}
