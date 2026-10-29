// ============================================================================
// QuantCooks CP-1 — pricing: the rate table + quote issuance (§6).
// ============================================================================
//
// Quote-before-spend mechanics (§6.1): quote → reserve → execute →
// settle-or-release. CP-1 delivers the QUOTE half and the port interface;
// CP-2 wires the ledger (@quant/credits) behind CreditsExecutionPort.
// Until then the registry runs with the null port: FREE tools are
// unaffected, credit-bearing Tier A sync tools execute UNMETERED with
// `metering: 'not_wired'` stated on the result (§6.2 — today's honest
// state, never presented as metering), and credit-bearing async tools are
// Tier B anyway (their executors refuse for provider reasons first).
//
// Whole credits only (K4/§6.4): the ledger cannot represent fractions, so
// the rate table's rule type is integer-valued and validateRateTable()
// rejects a non-integer row at registry boot — a future editor typing 0.3
// gets a failing check and a pointer here, not a silently rounded price.
// Final pricing policy is Krish/CEO's (§14 open decision 1); the table is
// data precisely so their decision is a one-line change.
// ============================================================================

import { createHash, randomUUID } from 'node:crypto';
import { createAppError } from '@quant/server-core';

export type PricingRule =
  | { type: 'free' }
  | { type: 'flat'; credits: number }
  /** Rate row exists but its value is set by the owning G-unit (§6.3). */
  | { type: 'flat'; credits: null }
  | { type: 'per_second'; creditsPerSecond: number }
  | { type: 'per_second'; creditsPerSecond: null }
  /** Price comes from the generation provider's quote for the exact
   *  params; pre-provider, quotes refuse (§8) — never an invented number. */
  | { type: 'provider' }
  /** Σ of step quotes (run_pipeline / plan consumers). */
  | { type: 'plan' }
  /** Landed pre-CP-2 surface (C-2/C-3B twins): no rate row exists, jobs
   *  record creditCost 0 and state metering 'not_wired'. */
  | { type: 'not_wired' };

export const RATE_TABLE: Record<string, PricingRule> = {
  // Anchored values (§6.3): the two prices the product already states.
  'quantcooks.suggest_titles': { type: 'flat', credits: 1 },
  'quantcooks.generate_captions': { type: 'flat', credits: 1 },
  'quantcooks.run_auto_edit': { type: 'flat', credits: 10 },
  // Rate rows whose values land with their G-units (null = unset; quotes
  // for these tools refuse with the tool's own NOT_CONFIGURED code, the
  // same truth the invoke path states).
  'quantcooks.dub_video': { type: 'per_second', creditsPerSecond: null }, // G-6
  'quantcooks.transform_video': { type: 'per_second', creditsPerSecond: null }, // G-10
  'quantcooks.create_chef_persona': { type: 'flat', credits: null }, // G-5
  'quantcooks.clone_voice': { type: 'flat', credits: null }, // G-6
  'quantcooks.add_voiceover': { type: 'flat', credits: null }, // G-6, per-engine row
  'quantcooks.upscale_asset': { type: 'flat', credits: null }, // G-14, per-target row
  'quantcooks.score_hook': { type: 'flat', credits: null }, // G-13
  // PROVIDER-priced generation (§6.3): no local number exists until G-1.
  'quantcooks.generate_dish_image': { type: 'provider' },
  'quantcooks.generate_video_from_text': { type: 'provider' },
  'quantcooks.animate_image': { type: 'provider' },
  'quantcooks.create_storyboard': { type: 'provider' },
  'quantcooks.create_shot_sequence': { type: 'provider' },
  'quantcooks.make_presenter_speak': { type: 'provider' },
  'quantcooks.create_food_ad': { type: 'provider' },
  'quantcooks.vary_ad': { type: 'provider' },
  'quantcooks.create_ugc_clip': { type: 'provider' },
  'quantcooks.create_story_episode': { type: 'provider' },
  // PLAN-priced.
  'quantcooks.run_pipeline': { type: 'plan' },
  // Ratified Craft twins (C-2/C-3B) + the C-7 step-4 design pair:
  // pricing policy is reserved to Krish/CEO; their landed definitions
  // declare metering 'not_wired'.
  'quantcooks.render_effects': { type: 'not_wired' },
  'quantcooks.edit_photo': { type: 'not_wired' },
  'quantcooks.create_design': { type: 'not_wired' },
  'quantcooks.export_design': { type: 'not_wired' },
  // Everything else is FREE (the registry defaults an unlisted tool to
  // free, and the registry test pins this table's key set as data).
};

/** Boot validation (§6.3): fractional or negative rows are a hard error. */
export function validateRateTable(table: Record<string, PricingRule> = RATE_TABLE): void {
  for (const [tool, rule] of Object.entries(table)) {
    if (rule.type === 'flat' && rule.credits !== null) {
      if (!Number.isInteger(rule.credits) || rule.credits < 0) {
        throw new Error(
          `RATE_TABLE[${tool}]: flat credits must be a non-negative whole number ` +
            `(got ${rule.credits}) — fractional pricing is an ecosystem ledger decision, see CP-1 spec §6.4`,
        );
      }
    }
    if (rule.type === 'per_second' && rule.creditsPerSecond !== null) {
      if (!Number.isInteger(rule.creditsPerSecond) || rule.creditsPerSecond < 0) {
        throw new Error(
          `RATE_TABLE[${tool}]: creditsPerSecond must be a non-negative whole number ` +
            `(got ${rule.creditsPerSecond}) — see CP-1 spec §6.4`,
        );
      }
    }
  }
}

export function pricingRuleFor(toolName: string): PricingRule {
  return RATE_TABLE[toolName] ?? { type: 'free' };
}

/** §2.3 costEstimate hint for QuantAI's planner — never a price. */
export function costEstimateFor(rule: PricingRule): 'free' | 'low' | 'medium' | 'high' {
  switch (rule.type) {
    case 'free':
    case 'not_wired':
      return 'free';
    case 'flat':
      if (rule.credits === null) return 'high';
      if (rule.credits <= 2) return 'low';
      if (rule.credits <= 15) return 'medium';
      return 'high';
    case 'per_second':
      return rule.creditsPerSecond === null ? 'high' : 'medium';
    case 'provider':
    case 'plan':
      return 'high';
  }
}

// ---------------------------------------------------------------------------
// Quotes (§6.2): CP-1's own QuoteRecord, in-memory, 15-minute expiry.
// ---------------------------------------------------------------------------

export interface QuoteRecord {
  quoteId: string;
  userId: string;
  tool: string;
  paramsHash: string;
  credits: number;
  breakdown: { label: string; credits: number }[];
  expiresAt: Date;
}

export const QUOTE_TTL_MS = 15 * 60 * 1000;

/** Canonical params hash: stable stringify (sorted keys) + sha256. */
export function paramsHash(params: unknown): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(value as Record<string, unknown>).sort()) {
        out[key] = canonical((value as Record<string, unknown>)[key]);
      }
      return out;
    }
    return value;
  };
  return createHash('sha256').update(JSON.stringify(canonical(params))).digest('hex');
}

export class QuoteStore {
  private readonly quotes = new Map<string, QuoteRecord>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  issue(record: Omit<QuoteRecord, 'quoteId' | 'expiresAt'>): QuoteRecord {
    const quote: QuoteRecord = {
      ...record,
      quoteId: `quote_${randomUUID()}`,
      expiresAt: new Date(this.now().getTime() + QUOTE_TTL_MS),
    };
    this.quotes.set(quote.quoteId, quote);
    return quote;
  }

  get(quoteId: string): QuoteRecord | null {
    return this.quotes.get(quoteId) ?? null;
  }

  /**
   * Validate an invoke's accepted quote (§13.5): must exist, belong to this
   * user + tool, match the params hash, and be unexpired. An expired quote
   * is 409 QUOTE_EXPIRED; every other mismatch is 400 QUOTE_MISMATCH.
   */
  validateForInvoke(args: {
    quoteId: string;
    userId: string;
    tool: string;
    params: unknown;
  }): QuoteRecord {
    const quote = this.quotes.get(args.quoteId);
    if (!quote) {
      throw createAppError('Quote not found', 400, 'QUOTE_MISMATCH');
    }
    if (quote.expiresAt.getTime() <= this.now().getTime()) {
      throw createAppError('This quote has expired; request a fresh quote', 409, 'QUOTE_EXPIRED');
    }
    if (
      quote.userId !== args.userId ||
      quote.tool !== args.tool ||
      quote.paramsHash !== paramsHash(args.params)
    ) {
      throw createAppError(
        'Quote does not match this invoke (user, tool or params differ)',
        400,
        'QUOTE_MISMATCH',
      );
    }
    return quote;
  }
}

// ---------------------------------------------------------------------------
// CreditsExecutionPort (§6.2): CP-2 implements this against @quant/credits.
// CP-1 ships the interface + the null port. The registry only calls the
// port when one is configured; with the null port, charged Tier A sync
// tools run unmetered and say so (`metering: 'not_wired'`).
// ---------------------------------------------------------------------------

export interface CreditsExecutionPort {
  reserve(userId: string, jobId: string, credits: number): Promise<{ reservationKey: string }>;
  settle(jobId: string, actualCredits: number): Promise<void>; // idempotent
  release(jobId: string): Promise<void>; // settle at 0
  getBalance(userId: string): Promise<{
    daily: number;
    monthly: number;
    purchased: number;
    total: number;
    held: number;
  }>;
}
