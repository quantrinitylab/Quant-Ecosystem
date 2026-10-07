// ============================================================================
// Billing module — PlanService (plan tiers, entitlements, rate limits)
// quantmail-superhub · Task 28.1 (Requirements 19.1, 19.2, 19.3, 19.4)
// ============================================================================
//
// PURPOSE
//   Implements the design's `PlanService` (design §"INTERFACE PlanService") —
//   the component the UsageGate consults for an owner's ENTITLEMENTS and RATE
//   LIMITS, and through which an owner upgrades/downgrades their plan:
//
//       FUNCTION getPlan(ownerRef) RETURNS Plan
//       FUNCTION entitlements(ownerRef) RETURNS Entitlements
//         // {dailyAllowance, monthlyIncludedCredits, rateLimits[],
//         //  unlockedModels[], unlockedFeatures[]}
//         POSTCONDITION: entitlements reflect the currently active Subscription
//       PROCEDURE changePlan(ownerRef, newPlanId, effective) RETURNS Subscription
//         PRECONDITION:  caller owns ownerRef OR is tenant admin
//         POSTCONDITION: upgrade/downgrade recorded
//         POSTCONDITION: new dailyAllowance applies from the next daily reset
//                        (or immediately on an upgrade)
//
//   The four Plan_Tiers (Free / Pro / Team / Enterprise) and their entitlements
//   live in a static {@link PLAN_CATALOG} (code constants — no DB row required,
//   per the task). An owner's *active* tier is resolved from an additive
//   {@link PlanSubscription} row; when no active/trialing subscription exists the
//   owner defaults to FREE (Req 19.1).
//
//   This service satisfies two billing seams without crossing a module
//   boundary:
//     • {@link EntitlementPort} (UsageGate) — `permits(ownerRef, kind)` rejects a
//       cost driver whose model/feature is LOCKED on the active plan OR whose
//       per-feature RATE LIMIT is exceeded, so the gate fails closed with
//       UPGRADE_REQUIRED (Req 19.2). See {@link createPlanEntitlementPort}.
//     • {@link DailyAllowanceProvider} (CreditWallet) — feeds the active plan's
//       `dailyAllowance` into the idempotent daily grant (Req 19.1/19.3). See
//       {@link createPlanDailyAllowanceProvider}.
//
//   Rate-limit tracking is backed by an injectable counter + clock seam so it is
//   deterministically testable; an in-memory default is provided.
//
// MODULE BOUNDARY
//   Infrastructure module (like `modules/code`). It does NOT import the mail
//   domain or QuantChat. It reuses the cross-cutting ownership rule via the
//   shared `ownership-authz` helper for the owner-scoped `changePlan`.

import type { PrismaClient } from '@quant/database';
import { createAppError } from './errors';
import {
  assertOwnership,
  ownerOnlyAuthz,
  type OwnershipAuthzPort,
  type OwnershipPrincipal,
} from './ownership-authz';
import type { ActionKind, Credits } from './pricing-engine.service';
import type { DailyAllowanceProvider, OwnerRef as WalletOwnerRef } from './credit-wallet.service';
import type { EntitlementPort } from './usage-gate.service';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/** A subscription tier (design `Plan_Tier`). */
export type PlanTier = 'free' | 'pro' | 'team' | 'enterprise';

/** Subscription lifecycle states (design `Subscription.status`). */
export type SubscriptionStatus = 'active' | 'trialing' | 'canceled' | 'expired' | 'past_due';

/** A subscription that grants entitlements: only these tiers are "active". */
const ACTIVE_STATUSES: readonly SubscriptionStatus[] = ['active', 'trialing'];

/**
 * A per-feature rate ceiling. A `null`/absent window means "no limit" for that
 * window. The gate rejects an action whose count would EXCEED a defined window.
 */
export interface RateLimit {
  /** The cost driver this ceiling applies to. */
  kind: ActionKind;
  /** Max permitted actions within a single UTC minute (omit = unlimited). */
  perMinute?: number;
  /** Max permitted actions within a single UTC day (omit = unlimited). */
  perDay?: number;
}

/**
 * The entitlements a plan grants (design `Entitlements`). Resolved for the
 * owner's currently active tier.
 */
export interface PlanEntitlements {
  /** The active tier these entitlements were resolved from. */
  tier: PlanTier;
  /** Recurring daily free credits granted at the UTC reset. */
  dailyAllowance: Credits;
  /** Credits granted each billing cycle. */
  monthlyIncludedCredits: Credits;
  /** Per-feature rate ceilings. */
  rateLimits: RateLimit[];
  /** Premium models this plan may route to (`['*']` = all models). */
  unlockedModels: string[];
  /** Gated features this plan unlocks (`['*']` = all features). */
  unlockedFeatures: string[];
}

/** A full plan definition in the static catalog (design `STRUCTURE Plan`). */
export interface PlanDefinition extends PlanEntitlements {
  /** The tier key (equals {@link PlanEntitlements.tier}). */
  key: PlanTier;
  /** Human-readable plan name. */
  displayName: string;
  /** Monthly price in `currency` minor units' major value (e.g. dollars). */
  priceMonthly: number;
  /** ISO currency code. */
  currency: string;
}

/** Identifies the owner whose plan/entitlements are being resolved. */
export interface PlanOwnerRef {
  /** The owning user/org id (the subscription ownership key). */
  ownerId: string;
  /** "user" | "org". Defaults to "user". */
  ownerType?: 'user' | 'org';
  /** The tenant the owner belongs to (enables tenant-admin changes). */
  tenantId?: string;
}

/**
 * A persisted subscription row (mirrors the additive Prisma `PlanSubscription`).
 * Kept structurally identical to the generated client type.
 */
export interface PlanSubscriptionRecord {
  id: string;
  ownerRef: string;
  ownerType: string;
  tenantId: string | null;
  planTier: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  /** A scheduled (downgrade) change that applies at {@link effectiveAt}. */
  pendingPlanTier: string | null;
  /** When a scheduled change takes effect (the next period/reset boundary). */
  effectiveAt: Date | null;
  providerSubId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The resolved plan for an owner (design `getPlan` result). */
export interface ResolvedPlan {
  /** The currently EFFECTIVE tier (accounts for an elapsed scheduled change). */
  tier: PlanTier;
  /** The full catalog definition for {@link tier}. */
  definition: PlanDefinition;
  /** The backing subscription, or `null` when the owner is on the default FREE. */
  subscription: PlanSubscriptionRecord | null;
}

// ---------------------------------------------------------------------------
// Static plan catalog — the four tiers and their entitlements
// ---------------------------------------------------------------------------

/** Tier ordering used to classify a plan change as an upgrade or a downgrade. */
const TIER_RANK: Readonly<Record<PlanTier, number>> = {
  free: 0,
  pro: 1,
  team: 2,
  enterprise: 3,
};

/**
 * Maps a cost driver to the gated FEATURE key it requires. A driver with no
 * entry here is never feature-locked (it is governed by rate limits only).
 */
const ACTION_FEATURE: Partial<Record<ActionKind, string>> = {
  // Spawning/raising an autonomous agent org is a gated capability.
  agent_org_run: 'agent_org',
};

/**
 * The static plan catalog. These are CODE CONSTANTS (per the task): the four
 * tiers and the entitlements each grants. Entitlement resolution and the
 * UsageGate read from here; no DB row is required to know what a tier grants.
 */
export const PLAN_CATALOG: Readonly<Record<PlanTier, PlanDefinition>> = {
  free: {
    key: 'free',
    tier: 'free',
    displayName: 'Free',
    dailyAllowance: 100,
    monthlyIncludedCredits: 0,
    rateLimits: [
      { kind: 'ai_inference', perMinute: 10, perDay: 200 },
      { kind: 'rag_query', perMinute: 5, perDay: 20 },
      { kind: 'email_send', perDay: 50 },
    ],
    unlockedModels: ['gpt-4o-mini'],
    unlockedFeatures: [],
    priceMonthly: 0,
    currency: 'USD',
  },
  pro: {
    key: 'pro',
    tier: 'pro',
    displayName: 'Pro',
    dailyAllowance: 500,
    monthlyIncludedCredits: 10_000,
    rateLimits: [
      { kind: 'ai_inference', perMinute: 60, perDay: 5_000 },
      { kind: 'rag_query', perMinute: 30, perDay: 1_000 },
      { kind: 'email_send', perDay: 1_000 },
    ],
    unlockedModels: ['gpt-4o-mini', 'gpt-4o', 'claude-3-5-sonnet'],
    unlockedFeatures: ['answer_engine', 'agent_org'],
    priceMonthly: 20,
    currency: 'USD',
  },
  team: {
    key: 'team',
    tier: 'team',
    displayName: 'Team',
    dailyAllowance: 1_000,
    monthlyIncludedCredits: 50_000,
    rateLimits: [
      { kind: 'ai_inference', perMinute: 120, perDay: 20_000 },
      { kind: 'rag_query', perMinute: 60, perDay: 5_000 },
      { kind: 'email_send', perDay: 5_000 },
    ],
    unlockedModels: ['gpt-4o-mini', 'gpt-4o', 'claude-3-5-sonnet', 'o1'],
    unlockedFeatures: ['answer_engine', 'agent_org', 'autonomous_gmail'],
    priceMonthly: 60,
    currency: 'USD',
  },
  enterprise: {
    key: 'enterprise',
    tier: 'enterprise',
    displayName: 'Enterprise',
    dailyAllowance: 5_000,
    monthlyIncludedCredits: 250_000,
    // No rate-limit entries: Enterprise is unmetered on the per-feature ceilings.
    rateLimits: [],
    unlockedModels: ['*'],
    unlockedFeatures: ['*'],
    priceMonthly: 0, // negotiated
    currency: 'USD',
  },
};

/** The tier an owner defaults to with no active/trialing subscription (Req 19.1). */
export const DEFAULT_PLAN_TIER: PlanTier = 'free';

// ---------------------------------------------------------------------------
// Rate-counter + clock seams (injectable; deterministic in tests)
// ---------------------------------------------------------------------------

/**
 * Stores per-(owner, kind, window-bucket) action counts for rate limiting.
 * Bucket keys embed the time window so stale windows naturally fall out of
 * scope. The default {@link InMemoryRateCounter} is process-local; a Phase-7+
 * deployment can inject a Redis-backed store with the same shape.
 */
export interface RateCounterStore {
  /** Current count recorded for `bucketKey`. */
  current(bucketKey: string): number | Promise<number>;
  /** Record one more action against `bucketKey`. */
  increment(bucketKey: string): void | Promise<void>;
}

/** A trivial process-local {@link RateCounterStore}. */
export class InMemoryRateCounter implements RateCounterStore {
  private readonly counts = new Map<string, number>();

  current(bucketKey: string): number {
    return this.counts.get(bucketKey) ?? 0;
  }

  increment(bucketKey: string): void {
    this.counts.set(bucketKey, this.current(bucketKey) + 1);
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Coerce/normalize an unknown string to a known {@link PlanTier} (else FREE). */
function toTier(value: unknown): PlanTier {
  return value === 'pro' || value === 'team' || value === 'enterprise' || value === 'free'
    ? value
    : DEFAULT_PLAN_TIER;
}

/** The UTC minute bucket id for a clock instant. */
function minuteBucket(now: Date): number {
  return Math.floor(now.getTime() / 60_000);
}

/** The UTC day bucket id (`YYYY-MM-DD`) for a clock instant. */
function dayBucket(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Add `days` to a date, returning a new Date. */
function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// PlanService
// ---------------------------------------------------------------------------

export interface PlanServiceOptions {
  /** The plan catalog. Defaults to {@link PLAN_CATALOG}. */
  catalog?: Readonly<Record<PlanTier, PlanDefinition>>;
  /**
   * Ownership/tenant authorization filter used by {@link PlanService.changePlan}
   * when a caller principal is supplied. Defaults to the shared owner-only /
   * tenant-admin rule the mail domain enforces.
   */
  authz?: OwnershipAuthzPort;
  /** Id generator seam (overridable for deterministic tests). */
  generateId?: () => string;
  /** Clock seam (overridable for deterministic tests). */
  clock?: () => Date;
  /** Rate-limit counter store. Defaults to {@link InMemoryRateCounter}. */
  rateCounter?: RateCounterStore;
  /** Length of a created subscription's billing period, in days (default 30). */
  periodDays?: number;
}

/** Options for {@link PlanService.changePlan}. */
export interface ChangePlanOptions {
  /**
   * The principal requesting the change. When provided, ownership is asserted
   * (caller must own `ownerRef` or be a tenant admin — design precondition).
   */
  caller?: OwnershipPrincipal;
  /**
   * Force the effective boundary. `'immediate'` applies now; `'period_end'`
   * schedules the change for the current period end. By default an UPGRADE
   * applies immediately and a DOWNGRADE applies at the next period/reset.
   */
  effective?: 'immediate' | 'period_end';
  /** Opaque PaymentProvider subscription ref to record on the row. */
  providerSubId?: string;
}

/**
 * Resolves plan tiers, entitlements, and rate limits, and applies plan changes.
 *
 * Reads (`entitlements` / `getPlan` / `permits`) DEFAULT to FREE when the owner
 * has no active/trialing subscription (Req 19.1) and account for an elapsed
 * scheduled (downgrade) change so a downgrade takes effect at its boundary
 * without a write-on-read (Req 19.3). `changePlan` records upgrades/downgrades
 * while enforcing AT MOST ONE active/trialing subscription per owner (Req 19.4).
 */
export class PlanService {
  private readonly catalog: Readonly<Record<PlanTier, PlanDefinition>>;
  private readonly authz: OwnershipAuthzPort;
  private readonly generateId: () => string;
  private readonly clock: () => Date;
  private readonly rateCounter: RateCounterStore;
  private readonly periodDays: number;

  constructor(
    private readonly prisma: PrismaClient,
    options: PlanServiceOptions = {},
  ) {
    this.catalog = options.catalog ?? PLAN_CATALOG;
    this.authz = options.authz ?? ownerOnlyAuthz;
    this.generateId = options.generateId ?? (() => globalThis.crypto.randomUUID());
    this.clock = options.clock ?? (() => new Date());
    this.rateCounter = options.rateCounter ?? new InMemoryRateCounter();
    this.periodDays = options.periodDays && options.periodDays > 0 ? options.periodDays : 30;
  }

  /**
   * Resolve the owner's currently active plan (design `getPlan`).
   *
   * POSTCONDITION (Req 19.1): returns the EFFECTIVE tier of the owner's
   * active/trialing subscription, or the default FREE plan when none exists. A
   * scheduled downgrade whose `effectiveAt` has elapsed is reflected here.
   */
  async getPlan(ownerRef: PlanOwnerRef): Promise<ResolvedPlan> {
    const ownerId = this.requireOwnerId(ownerRef);
    const subscription = await this.findActiveSubscription(ownerId);
    const tier = this.effectiveTier(subscription);
    return { tier, definition: this.catalog[tier], subscription };
  }

  /**
   * Resolve the entitlements granted by the owner's active plan (design
   * `entitlements`).
   *
   * POSTCONDITION (Req 19.1): returns the active tier's daily allowance, monthly
   * included credits, rate limits, unlocked models, and unlocked features.
   * Defaults to FREE when there is no active/trialing subscription.
   */
  async entitlements(ownerRef: PlanOwnerRef): Promise<PlanEntitlements> {
    const { definition } = await this.getPlan(ownerRef);
    return {
      tier: definition.tier,
      dailyAllowance: definition.dailyAllowance,
      monthlyIncludedCredits: definition.monthlyIncludedCredits,
      // Copy arrays so callers cannot mutate the shared catalog constants.
      rateLimits: definition.rateLimits.map((r) => ({ ...r })),
      unlockedModels: [...definition.unlockedModels],
      unlockedFeatures: [...definition.unlockedFeatures],
    };
  }

  /**
   * Decide whether the owner's plan PERMITS a cost driver right now — the
   * {@link EntitlementPort} the UsageGate consults. Returns `false` (the gate
   * then rejects with UPGRADE_REQUIRED, Req 19.2) when:
   *
   *   • the driver maps to a FEATURE the active plan does not unlock, or
   *   • an optional `modelId` is not in the plan's unlocked models, or
   *   • performing the action would EXCEED a per-minute or per-day rate limit.
   *
   * On success the action is COUNTED against the owner's rate-limit windows.
   * Because the gate de-dupes by `actionKey` before calling this, a retried
   * action with the same key is not double-counted.
   */
  async permits(
    ownerRef: PlanOwnerRef,
    kind: ActionKind,
    options: { modelId?: string } = {},
  ): Promise<boolean> {
    const ownerId = this.requireOwnerId(ownerRef);
    const ent = await this.entitlements(ownerRef);

    // FEATURE LOCK (Req 19.2): a gated driver is rejected unless the plan
    // unlocks its feature ('*' unlocks everything).
    const feature = ACTION_FEATURE[kind];
    if (feature != null && !this.unlocks(ent.unlockedFeatures, feature)) {
      return false;
    }

    // MODEL LOCK (Req 19.2): a named model must be in the plan's unlocked set.
    if (nonEmpty(options.modelId) && !this.unlocks(ent.unlockedModels, options.modelId)) {
      return false;
    }

    // RATE LIMIT (Req 19.2): reject when the action would exceed a defined
    // window; otherwise consume one token from each applicable window.
    const limit = ent.rateLimits.find((r) => r.kind === kind);
    if (limit != null) {
      const now = this.clock();
      const minuteKey =
        limit.perMinute != null ? `${ownerId}:${kind}:m:${minuteBucket(now)}` : null;
      const dayKey = limit.perDay != null ? `${ownerId}:${kind}:d:${dayBucket(now)}` : null;

      if (minuteKey != null && limit.perMinute != null) {
        const used = await this.rateCounter.current(minuteKey);
        if (used + 1 > limit.perMinute) return false;
      }
      if (dayKey != null && limit.perDay != null) {
        const used = await this.rateCounter.current(dayKey);
        if (used + 1 > limit.perDay) return false;
      }

      // Permitted — count the action against each applicable window.
      if (minuteKey != null) await this.rateCounter.increment(minuteKey);
      if (dayKey != null) await this.rateCounter.increment(dayKey);
    }

    return true;
  }

  /**
   * Record a plan upgrade or downgrade for the owner (design `changePlan`).
   *
   * PRECONDITION: when `options.caller` is supplied, the caller must OWN
   * `ownerRef` or be a tenant admin (enforced via the injected authz filter).
   * INVARIANT (Req 19.4): AT MOST ONE active/trialing subscription per owner —
   * this NEVER creates a second active row; it mutates the single existing one
   * (or creates the first when the owner was on the default FREE).
   * POSTCONDITION (Req 19.3): an UPGRADE applies immediately (new tier + daily
   * allowance now); a DOWNGRADE is recorded as a PENDING change that applies at
   * the next period/reset boundary (`effectiveAt = currentPeriodEnd`).
   *
   * @throws 400 INVALID_PLAN_TIER  when `newTier` is not a known tier.
   * @throws 403 FORBIDDEN          when a supplied caller is not authorized.
   */
  async changePlan(
    ownerRef: PlanOwnerRef,
    newTier: PlanTier,
    options: ChangePlanOptions = {},
  ): Promise<PlanSubscriptionRecord> {
    const ownerId = this.requireOwnerId(ownerRef);
    if (this.catalog[newTier] == null) {
      throw createAppError(`Invalid plan tier '${String(newTier)}'`, 400, 'INVALID_PLAN_TIER');
    }

    // AUTHZ (design precondition): an owner-scoped change requires ownership.
    if (options.caller != null) {
      assertOwnership(this.authz, options.caller, {
        ownerId,
        tenantId: ownerRef.tenantId,
        kind: 'subscription',
        resourceId: ownerId,
      });
    }

    const now = this.clock();
    const active = await this.findActiveSubscription(ownerId);

    // No active subscription: create EXACTLY ONE. A change away from FREE is an
    // upgrade applied immediately; "changing to FREE" with no sub is a no-op
    // (FREE is the default and needs no row).
    if (active == null) {
      if (newTier === 'free') {
        // Synthesize the implicit FREE plan record without persisting a row.
        return this.syntheticFreeSubscription(ownerRef, now);
      }
      return this.createSubscription(ownerRef, newTier, now, options.providerSubId);
    }

    const currentTier = this.effectiveTier(active);
    const wantImmediate =
      options.effective === 'immediate' ||
      (options.effective == null && TIER_RANK[newTier] > TIER_RANK[currentTier]);

    if (newTier === currentTier && active.pendingPlanTier == null) {
      // No-op: already on the requested tier with nothing pending.
      return active;
    }

    if (wantImmediate) {
      // UPGRADE (or forced-immediate): apply the new tier now and clear any
      // previously-scheduled change. Reset the period so the new allowance and
      // included credits take effect immediately.
      return this.persist(active.id, {
        planTier: newTier,
        status: 'active',
        pendingPlanTier: null,
        effectiveAt: null,
        currentPeriodStart: now,
        currentPeriodEnd: addDays(now, this.periodDays),
        providerSubId: options.providerSubId ?? active.providerSubId,
      });
    }

    // DOWNGRADE (or forced period_end): schedule the change for the next
    // period/reset boundary. The current tier's entitlements stay in force
    // until `effectiveAt`; reads apply the pending tier once it elapses.
    return this.persist(active.id, {
      pendingPlanTier: newTier,
      effectiveAt: active.currentPeriodEnd,
      providerSubId: options.providerSubId ?? active.providerSubId,
    });
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  private requireOwnerId(ownerRef: PlanOwnerRef): string {
    if (!nonEmpty(ownerRef?.ownerId)) {
      throw createAppError('ownerRef.ownerId is required', 400, 'OWNER_REF_REQUIRED');
    }
    return ownerRef.ownerId;
  }

  /** `true` when `unlocked` grants `key` (directly or via the `'*'` wildcard). */
  private unlocks(unlocked: string[], key: string): boolean {
    return unlocked.includes('*') || unlocked.includes(key);
  }

  /**
   * The EFFECTIVE tier of a subscription: a scheduled change whose `effectiveAt`
   * has elapsed (relative to the clock) is applied; otherwise the stored tier.
   */
  private effectiveTier(sub: PlanSubscriptionRecord | null): PlanTier {
    if (sub == null) return DEFAULT_PLAN_TIER;
    if (
      nonEmpty(sub.pendingPlanTier) &&
      sub.effectiveAt != null &&
      sub.effectiveAt.getTime() <= this.clock().getTime()
    ) {
      return toTier(sub.pendingPlanTier);
    }
    return toTier(sub.planTier);
  }

  /** Find the owner's single active/trialing subscription, if any (Req 19.4). */
  private async findActiveSubscription(ownerId: string): Promise<PlanSubscriptionRecord | null> {
    const row = await this.prisma.planSubscription.findFirst({
      where: { ownerRef: ownerId, status: { in: [...ACTIVE_STATUSES] } },
      orderBy: { createdAt: 'desc' },
    });
    return (row as PlanSubscriptionRecord | null) ?? null;
  }

  /** Create the owner's first active subscription at `tier`. */
  private async createSubscription(
    ownerRef: PlanOwnerRef,
    tier: PlanTier,
    now: Date,
    providerSubId?: string,
  ): Promise<PlanSubscriptionRecord> {
    const row = await this.prisma.planSubscription.create({
      data: {
        id: this.generateId(),
        ownerRef: ownerRef.ownerId,
        ownerType: ownerRef.ownerType ?? 'user',
        tenantId: ownerRef.tenantId ?? null,
        planTier: tier,
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: addDays(now, this.periodDays),
        pendingPlanTier: null,
        effectiveAt: null,
        providerSubId: providerSubId ?? null,
      },
    });
    return row as PlanSubscriptionRecord;
  }

  /** Apply a partial update to a subscription row and return the result. */
  private async persist(
    id: string,
    data: Record<string, unknown>,
  ): Promise<PlanSubscriptionRecord> {
    const row = await this.prisma.planSubscription.update({
      where: { id },
      data,
    });
    return row as PlanSubscriptionRecord;
  }

  /**
   * Build an in-memory FREE subscription record for an owner with no persisted
   * row (the default plan needs no DB entry — Req 19.1).
   */
  private syntheticFreeSubscription(ownerRef: PlanOwnerRef, now: Date): PlanSubscriptionRecord {
    return {
      id: `free:${ownerRef.ownerId}`,
      ownerRef: ownerRef.ownerId,
      ownerType: ownerRef.ownerType ?? 'user',
      tenantId: ownerRef.tenantId ?? null,
      planTier: 'free',
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: addDays(now, this.periodDays),
      pendingPlanTier: null,
      effectiveAt: null,
      providerSubId: null,
      createdAt: now,
      updatedAt: now,
    };
  }
}

// ---------------------------------------------------------------------------
// Adapters — feed PlanService into the UsageGate + CreditWallet seams
// ---------------------------------------------------------------------------

export interface PlanEntitlementPortOptions {
  /**
   * Map the gate's string `ownerRef` to a {@link PlanOwnerRef}. Defaults to
   * treating the string as a user id. Override to carry tenant/owner-type.
   */
  resolveOwner?(ownerRef: string): PlanOwnerRef;
}

/**
 * Build the UsageGate's {@link EntitlementPort} from a {@link PlanService}. The
 * gate calls `permits(ownerRef, kind)`; a `false` result makes the gate reject
 * the metered action with UPGRADE_REQUIRED (Req 19.2):
 *
 * ```ts
 * const entitlements = createPlanEntitlementPort(planService);
 * const gate = new UsageGate({ entitlements, balances, pricing });
 * ```
 */
export function createPlanEntitlementPort(
  planService: PlanService,
  options: PlanEntitlementPortOptions = {},
): EntitlementPort {
  const resolveOwner = options.resolveOwner ?? ((ref: string): PlanOwnerRef => ({ ownerId: ref }));
  return {
    permits(ownerRef, kind) {
      return planService.permits(resolveOwner(ownerRef), kind);
    },
  };
}

/**
 * Build the CreditWallet's {@link DailyAllowanceProvider} from a
 * {@link PlanService}: the daily grant is sized to the owner's active-plan
 * `dailyAllowance` (Req 19.1/19.3):
 *
 * ```ts
 * const dailyAllowanceProvider = createPlanDailyAllowanceProvider(planService);
 * const wallet = new CreditWallet(prisma, { dailyAllowanceProvider });
 * ```
 */
export function createPlanDailyAllowanceProvider(planService: PlanService): DailyAllowanceProvider {
  return async (ownerRef: WalletOwnerRef): Promise<number> => {
    const ent = await planService.entitlements({
      ownerId: ownerRef.ownerId,
      ownerType: ownerRef.ownerType,
      tenantId: ownerRef.tenantId,
    });
    return ent.dailyAllowance;
  };
}
