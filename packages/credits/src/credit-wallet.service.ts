// ============================================================================
// Billing module — CreditWallet over an immutable, append-only CreditLedgerEntry
// quantmail-superhub · Task 25.1 (Requirements 16.1, 16.2, 16.3, 16.4, 16.5)
// ============================================================================
//
// PURPOSE
//   Implements the design's `CreditWallet` (design §"INTERFACE CreditWallet").
//   The wallet's authoritative balance is NEVER stored: it is DERIVED as the
//   sum of an owner's append-only `CreditLedgerEntry` rows (Req 16.1). Every
//   mutation appends ONE new immutable entry; entries are never updated or
//   deleted (Req 16.3). `amount` is a SIGNED whole-credit delta, so the total
//   is literally `SUM(amount)` and the `total >= 0` invariant (Req 16.2) is
//   checked at append time. The `bucket` dimension (DAILY / MONTHLY /
//   PURCHASED) lets `getBalance` return the {daily, monthly, purchased, total}
//   breakdown.
//
//   AUTHZ (Req 16.4): `getBalance` is gated by the shared Ownership_Authz filter
//   (`ownerOnlyAuthz` / `assertOwnership`) — the caller must OWN the wallet or
//   be a tenant admin of the wallet's tenant, else a 403 is thrown. The filter
//   is injectable so the same rule the mail domain enforces is reused here
//   without crossing a module boundary.
//
//   SCOPE: this task implements `getBalance` and `credit` (Req 16.4, 16.5), plus
//   `grantDaily` (task 26 / Req 17.1-17.3) — the idempotent, non-rolling daily
//   free allowance — and `debit` (task 27 / Req 18.2, 18.3, 18.4) — the real
//   ledger-backed credit-consumption primitive that draws buckets in the fixed
//   order DAILY -> MONTHLY -> PURCHASED, fails closed (never negative), and is
//   idempotent by `actionKey`.
//
// MODULE BOUNDARY
//   This is an infrastructure module (like `modules/code`). It does NOT import
//   the mail domain or QuantChat. It consumes the cross-cutting authz rule via
//   the shared `ownership-authz` helper, never another module's services.

import type { PrismaClient, CreditLedgerEntry } from '@quant/database';
import { createAppError } from './errors';
import {
  ownerOnlyAuthz,
  assertOwnership,
  type OwnershipAuthzPort,
  type OwnershipPrincipal,
} from './ownership-authz';
import type { Credits } from './pricing-engine.service';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/** The credit sub-balances a wallet tracks (mirrors the Prisma `CreditBucket`). */
export type CreditBucket = 'DAILY' | 'MONTHLY' | 'PURCHASED';

/**
 * The kinds of POSITIVE ledger entries `credit()` may append.
 *
 * Top-up / correction kinds (design: `kind IN (purchase, monthly_grant, refund,
 * adjustment)`):
 *   purchase | monthly_grant | refund | adjustment
 *
 * EARN kinds — credits a user earns inside the ecosystem (creator payouts,
 * post/reel boosts revenue-share, QuantChat streak rewards, marketplace/in-game
 * item sales, referrals). They land in the PURCHASED bucket so they spend like
 * real-money credits, but keep their own `entryType` so earnings remain
 * identifiable for payout/withdrawal accounting (and platform commission)
 * without changing the {daily, monthly, purchased} balance shape:
 *   creator_payout | boost_earning | streak_reward | marketplace_sale | referral
 *
 * `daily_grant` is appended by `grantDaily` and `debit` by `debit`, so they are
 * not valid `credit()` kinds.
 */
export type CreditKind =
  | 'purchase'
  | 'monthly_grant'
  | 'refund'
  | 'adjustment'
  | 'creator_payout'
  | 'boost_earning'
  | 'streak_reward'
  | 'marketplace_sale'
  | 'referral';

/**
 * The earn-kinds — the subset of {@link CreditKind} that represents credits a
 * user earned (rather than bought or was granted). Used by payout/withdrawal
 * accounting to total a user's earned, cash-out-eligible balance.
 */
export const EARN_CREDIT_KINDS = [
  'creator_payout',
  'boost_earning',
  'streak_reward',
  'marketplace_sale',
  'referral',
] as const satisfies readonly CreditKind[];

/** The credit-kinds `credit()` accepts, and the bucket each contributes to. */
const CREDIT_KIND_BUCKET: Readonly<Record<CreditKind, CreditBucket>> = {
  purchase: 'PURCHASED',
  monthly_grant: 'MONTHLY',
  // Refunds/adjustments are corrections against purchased top-ups.
  refund: 'PURCHASED',
  adjustment: 'PURCHASED',
  // Earned credits are real-money-equivalent: spendable like purchased balance
  // and (later) eligible for withdrawal. Their distinct entryType keeps them
  // identifiable for payout accounting.
  creator_payout: 'PURCHASED',
  boost_earning: 'PURCHASED',
  streak_reward: 'PURCHASED',
  marketplace_sale: 'PURCHASED',
  referral: 'PURCHASED',
};

/**
 * Fallback daily free allowance (whole credits) used when no plan/allowance
 * source is wired. The real per-owner allowance comes from `PlanService`
 * (task 28); until then `grantDaily` resolves the amount from an injectable
 * {@link DailyAllowanceProvider} or a per-call override, defaulting to this.
 */
export const DEFAULT_DAILY_ALLOWANCE = 100;

/**
 * A source of the per-owner daily free allowance. Injected so task 28 can wire
 * the real `PlanService` without `CreditWallet` importing it (keeps the module
 * boundary clean). Returns the whole-credit daily allowance for `ownerRef`.
 */
export type DailyAllowanceProvider = (ownerRef: OwnerRef) => number | Promise<number>;

/** Per-call options for {@link CreditWallet.grantDaily}. */
export interface GrantDailyOptions {
  /**
   * Override the resolved daily allowance for this grant (whole credits >= 0).
   * Takes precedence over the injected {@link DailyAllowanceProvider} and the
   * {@link DEFAULT_DAILY_ALLOWANCE} fallback.
   */
  dailyAllowance?: Credits;
  /** Optional provenance for the grant (e.g. the reset job run id). */
  sourceRef?: string;
}

/**
 * The derived balance breakdown returned by {@link CreditWallet.getBalance}
 * (design `CreditBalance`). `total` always equals `daily + monthly + purchased`
 * and is `>= 0`.
 */
export interface CreditBalance {
  daily: Credits;
  monthly: Credits;
  purchased: Credits;
  total: Credits;
}

/**
 * Identifies the wallet owner being read/credited and (for authz) the tenant
 * the wallet belongs to. A wallet is owner-scoped (a user OR an org).
 */
export interface OwnerRef {
  /** The owning user/org id (the ledger ownership key). */
  ownerId: string;
  /** "user" | "org". Defaults to "user". */
  ownerType?: 'user' | 'org';
  /** The tenant the wallet belongs to (enables tenant-admin reads). */
  tenantId?: string;
}

export interface CreditWalletOptions {
  /**
   * Ownership/tenant authorization filter (Req 16.4). Defaults to the shared
   * owner-only/tenant-admin rule the mail domain enforces.
   */
  authz?: OwnershipAuthzPort;
  /** Id generator seam (overridable for deterministic tests). */
  generateId?: () => string;
  /**
   * Source of the per-owner daily free allowance used by {@link
   * CreditWallet.grantDaily}. Injected so the real `PlanService` (task 28) can
   * be wired without crossing a module boundary. Defaults to a provider that
   * returns {@link DEFAULT_DAILY_ALLOWANCE}.
   */
  dailyAllowanceProvider?: DailyAllowanceProvider;
}

/** Arguments to {@link CreditWallet.credit}. */
export interface CreditArgs {
  /** Positive whole-credit amount to grant (> 0). */
  amount: Credits;
  /** Why the credit is granted (controls the target bucket). */
  kind: CreditKind;
  /** Optional provenance (payment id, grant source, ...). */
  sourceRef?: string;
  /** Optional human-readable audit note. */
  reason?: string;
}

/** Optional provenance/audit metadata for a {@link CreditWallet.debit}. */
export interface DebitOptions {
  /** Provenance (e.g. the settling reservation id). */
  sourceRef?: string;
  /** Human-readable audit note. */
  reason?: string;
  /**
   * Override the bucket consumption order for this debit. Defaults to
   * {@link CONSUMPTION_ORDER} (DAILY -> MONTHLY -> PURCHASED). A payout passes
   * `['PURCHASED']` so a withdrawal draws ONLY against earned/purchased credits
   * and never burns the free DAILY allowance or plan-included MONTHLY credits.
   * Any bucket omitted from the order is not consumed (so a debit that cannot be
   * satisfied from the listed buckets fails closed with OUT_OF_CREDITS).
   */
  consumptionOrder?: readonly CreditBucket[];
}

/**
 * The outcome of a {@link CreditWallet.debit}: the per-bucket negative ledger
 * entries that were appended (or, on a replay, the prior debit's entries).
 */
export interface DebitResult {
  /** The logical idempotency key of the debit. */
  actionKey: string;
  /** Total credits debited (equals the requested `amount`). */
  total: Credits;
  /** Credits drawn from each bucket, in consumption order. */
  byBucket: { daily: Credits; monthly: Credits; purchased: Credits };
  /** The append-only ledger rows for this debit (one per consumed bucket). */
  entries: CreditLedgerEntry[];
  /**
   * True when this call REPLAYED a prior debit with the same `actionKey` (no
   * new rows appended); false when it appended fresh debit entries.
   */
  replayed: boolean;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** A whole, positive credit amount (rejects NaN/Infinity/<=0/fractional). */
function isPositiveWholeCredits(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** A whole, non-negative credit amount (a daily allowance may be 0). */
function isNonNegativeWholeCredits(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Matches a `YYYY-MM-DD` UTC-day bucket string. */
const UTC_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isUtcDay(value: unknown): value is string {
  return typeof value === 'string' && UTC_DAY_RE.test(value);
}

/** True for a Prisma unique-constraint violation (a lost idempotency race). */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
}

/**
 * The FIXED credit-consumption order (Req 18.2): a debit draws DAILY allowance
 * first, then plan-included MONTHLY credits, then PURCHASED top-up balance.
 */
const CONSUMPTION_ORDER: readonly CreditBucket[] = ['DAILY', 'MONTHLY', 'PURCHASED'];

// ---------------------------------------------------------------------------
// CreditWallet
// ---------------------------------------------------------------------------

/**
 * The owner-scoped credit wallet. Its balance is derived from an append-only,
 * immutable ledger — this service NEVER calls `update`/`delete` on a ledger
 * entry, preserving the append-only invariant (Req 16.3) structurally.
 */
export class CreditWallet {
  private readonly authz: OwnershipAuthzPort;
  private readonly generateId: () => string;
  private readonly dailyAllowanceProvider: DailyAllowanceProvider;

  constructor(
    private readonly prisma: PrismaClient,
    options: CreditWalletOptions = {},
  ) {
    this.authz = options.authz ?? ownerOnlyAuthz;
    this.generateId = options.generateId ?? (() => globalThis.crypto.randomUUID());
    this.dailyAllowanceProvider = options.dailyAllowanceProvider ?? (() => DEFAULT_DAILY_ALLOWANCE);
  }

  /**
   * Read the wallet's derived balance breakdown for `ownerRef`.
   *
   * PRECONDITION (Req 16.4): `caller` must OWN `ownerRef` or be a tenant admin
   * of the wallet's tenant — enforced by the injected Ownership_Authz filter.
   * POSTCONDITION (Req 16.1): `total == SUM(amount of all ledger entries)`.
   * INVARIANT (Req 16.2): `total >= 0`.
   *
   * @throws 403 FORBIDDEN  when the caller is neither owner nor tenant admin.
   */
  async getBalance(caller: OwnershipPrincipal, ownerRef: OwnerRef): Promise<CreditBalance> {
    if (!nonEmpty(ownerRef?.ownerId)) {
      throw createAppError('ownerRef.ownerId is required', 400, 'OWNER_REF_REQUIRED');
    }

    // AUTHZ GATE (Req 16.4): deny a non-owner / non-tenant-admin with 403.
    assertOwnership(this.authz, caller, {
      ownerId: ownerRef.ownerId,
      tenantId: ownerRef.tenantId,
      kind: 'wallet',
      resourceId: ownerRef.ownerId,
    });

    // Balance is DERIVED from the append-only ledger (Req 16.1): read every
    // entry for the owner and fold its SIGNED amount into the bucket totals.
    const entries = await this.prisma.creditLedgerEntry.findMany({
      where: { ownerRef: ownerRef.ownerId },
    });

    let daily = 0;
    let monthly = 0;
    let purchased = 0;
    for (const entry of entries) {
      const amount = Number.isFinite(entry.amount) ? entry.amount : 0;
      switch (entry.bucket) {
        case 'DAILY':
          daily += amount;
          break;
        case 'MONTHLY':
          monthly += amount;
          break;
        case 'PURCHASED':
        default:
          purchased += amount;
          break;
      }
    }

    const total = daily + monthly + purchased;

    // INVARIANT (Req 16.2): the derived total must never be negative. If the
    // ledger ever summed below zero it would indicate a violated append-time
    // guard, so fail loudly rather than report a negative balance.
    if (total < 0) {
      throw createAppError(
        'Wallet balance invariant violated: total < 0',
        500,
        'BALANCE_INVARIANT_VIOLATED',
      );
    }

    return { daily, monthly, purchased, total };
  }

  /**
   * Total credits the owner has EARNED (creator payouts, boosts, streaks,
   * marketplace sales, referrals) — i.e. the sum of all positive ledger entries
   * whose `entryType` is an {@link EARN_CREDIT_KINDS} kind. This is the
   * cash-out-eligible earned balance that a future withdrawal/payout flow draws
   * against (distinct from purchased top-ups and granted allowances).
   *
   * Note: this is a gross earned total from the ledger; a withdrawal flow will
   * net it against prior payouts. Authz mirrors {@link getBalance} (Req 16.4).
   *
   * @throws 403 FORBIDDEN  when the caller is neither owner nor tenant admin.
   */
  async getEarnedTotal(caller: OwnershipPrincipal, ownerRef: OwnerRef): Promise<Credits> {
    if (!nonEmpty(ownerRef?.ownerId)) {
      throw createAppError('ownerRef.ownerId is required', 400, 'OWNER_REF_REQUIRED');
    }
    assertOwnership(this.authz, caller, {
      ownerId: ownerRef.ownerId,
      tenantId: ownerRef.tenantId,
      kind: 'wallet',
      resourceId: ownerRef.ownerId,
    });

    const earnKinds = new Set<string>(EARN_CREDIT_KINDS);
    const entries = await this.prisma.creditLedgerEntry.findMany({
      where: { ownerRef: ownerRef.ownerId },
    });
    let earned = 0;
    for (const entry of entries) {
      if (earnKinds.has(entry.entryType)) {
        earned += Number.isFinite(entry.amount) ? entry.amount : 0;
      }
    }
    return Math.max(0, earned);
  }

  /**
   * List the owner's ledger entries (newest first), authz-gated like
   * {@link getBalance}. Lets thin adapters derive analytics (lifetime totals,
   * usage history) from the authoritative ledger instead of a parallel store.
   *
   * @throws 403 FORBIDDEN  when the caller is neither owner nor tenant admin.
   */
  async listEntries(caller: OwnershipPrincipal, ownerRef: OwnerRef): Promise<CreditLedgerEntry[]> {
    if (!nonEmpty(ownerRef?.ownerId)) {
      throw createAppError('ownerRef.ownerId is required', 400, 'OWNER_REF_REQUIRED');
    }
    assertOwnership(this.authz, caller, {
      ownerId: ownerRef.ownerId,
      tenantId: ownerRef.tenantId,
      kind: 'wallet',
      resourceId: ownerRef.ownerId,
    });
    const entries = await this.prisma.creditLedgerEntry.findMany({
      where: { ownerRef: ownerRef.ownerId },
    });
    return [...entries].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  /**
   * Append ONE positive credit entry, increasing the balance by EXACTLY
   * `amount` (Req 16.5).
   *
   * PRECONDITION: `amount > 0` (whole credits) and `kind` is one of
   * purchase | monthly_grant | refund | adjustment.
   * POSTCONDITION: appends exactly one immutable ledger entry; the balance
   * increases by exactly `amount`.
   * INVARIANT (Req 16.3): the ledger is append-only — no existing entry is ever
   * mutated or deleted.
   *
   * @throws 400 INVALID_AMOUNT  when `amount` is not a positive whole number.
   * @throws 400 INVALID_KIND    when `kind` is not an accepted credit kind.
   */
  async credit(ownerRef: OwnerRef, args: CreditArgs): Promise<CreditLedgerEntry> {
    if (!nonEmpty(ownerRef?.ownerId)) {
      throw createAppError('ownerRef.ownerId is required', 400, 'OWNER_REF_REQUIRED');
    }
    if (!isPositiveWholeCredits(args?.amount)) {
      throw createAppError(
        'credit amount must be a positive whole number of credits',
        400,
        'INVALID_AMOUNT',
      );
    }
    const bucket = CREDIT_KIND_BUCKET[args.kind];
    if (bucket == null) {
      throw createAppError(`Invalid credit kind '${String(args.kind)}'`, 400, 'INVALID_KIND');
    }

    // APPEND-ONLY (Req 16.3 / 16.5): create exactly ONE positive entry. The
    // positive signed `amount` makes the balance increase by exactly `amount`.
    return this.prisma.creditLedgerEntry.create({
      data: {
        id: this.generateId(),
        ownerRef: ownerRef.ownerId,
        ownerType: ownerRef.ownerType ?? 'user',
        tenantId: ownerRef.tenantId ?? null,
        entryType: args.kind,
        bucket,
        amount: args.amount,
        actionKey: null,
        sourceRef: args.sourceRef ?? null,
        utcDay: null,
        reason: args.reason ?? null,
      },
    });
  }

  /**
   * Append a positive credit EXACTLY ONCE, keyed by `actionKey` (idempotent
   * credit). Mirrors {@link debit}'s idempotency for the credit side: replaying
   * the same `actionKey` appends nothing and returns the prior entry. The
   * `actionKey` is stored on the (`@unique`) ledger `actionKey` column, so a
   * concurrent replay that loses the race returns the winning entry.
   *
   * This is what a marketplace/transfer settlement uses for the seller-credit
   * and commission legs so a retried purchase never double-credits.
   *
   * @throws 400 INVALID_AMOUNT       when `amount` is not a positive whole number.
   * @throws 400 INVALID_KIND         when `kind` is not an accepted credit kind.
   * @throws 400 ACTION_KEY_REQUIRED  when `actionKey` is empty.
   */
  async creditOnce(
    ownerRef: OwnerRef,
    args: CreditArgs,
    actionKey: string,
  ): Promise<CreditLedgerEntry> {
    if (!nonEmpty(ownerRef?.ownerId)) {
      throw createAppError('ownerRef.ownerId is required', 400, 'OWNER_REF_REQUIRED');
    }
    if (!isPositiveWholeCredits(args?.amount)) {
      throw createAppError(
        'credit amount must be a positive whole number of credits',
        400,
        'INVALID_AMOUNT',
      );
    }
    const bucket = CREDIT_KIND_BUCKET[args.kind];
    if (bucket == null) {
      throw createAppError(`Invalid credit kind '${String(args.kind)}'`, 400, 'INVALID_KIND');
    }
    if (!nonEmpty(actionKey)) {
      throw createAppError('credit actionKey is required', 400, 'ACTION_KEY_REQUIRED');
    }

    // IDEMPOTENCY: a prior credit for this actionKey appends nothing.
    const existing = await this.prisma.creditLedgerEntry.findFirst({ where: { actionKey } });
    if (existing != null) {
      return existing;
    }

    try {
      return await this.prisma.creditLedgerEntry.create({
        data: {
          id: this.generateId(),
          ownerRef: ownerRef.ownerId,
          ownerType: ownerRef.ownerType ?? 'user',
          tenantId: ownerRef.tenantId ?? null,
          entryType: args.kind,
          bucket,
          amount: args.amount,
          actionKey,
          sourceRef: args.sourceRef ?? null,
          utcDay: null,
          reason: args.reason ?? null,
        },
      });
    } catch (err) {
      // Lost the race on the @unique actionKey: return the winning entry.
      if (isUniqueViolation(err)) {
        const winner = await this.prisma.creditLedgerEntry.findFirst({ where: { actionKey } });
        if (winner != null) {
          return winner;
        }
      }
      throw err;
    }
  }

  /**
   * Append the recurring daily free allowance for `ownerRef` on `utcDay`,
   * idempotent per (owner, UTC day).
   *
   * PRECONDITION (Req 17.2): no `daily_grant` entry already exists for
   * (`ownerRef`, `utcDay`). If one does, this is a NO-OP and the existing entry
   * is returned (so a re-run by the reset job never double-grants).
   * POSTCONDITION (Req 17.1): appends EXACTLY ONE `daily_grant` entry into the
   * DAILY bucket sized to the resolved daily allowance.
   * INVARIANT (Req 17.2): at most one `daily_grant` per (owner, UTC day) — the
   * deterministic `actionKey` (`daily:{ownerId}:{utcDay}`) is also @unique at
   * the DB layer, closing the daily-reset-abuse race.
   *
   * NON-ROLLOVER (Req 17.3): the daily bucket balance is `SUM(DAILY entries)`,
   * so before granting today's allowance we append ONE reconciling
   * `daily_expiry` entry that zeroes the previous day's *unused* daily
   * remainder. This keeps the authoritative `total == SUM(ledger)` invariant
   * (Req 16.1) intact while ensuring yesterday's leftover daily credits are not
   * spendable today — the new day's daily balance reflects only the new grant.
   *
   * The daily allowance is resolved from (in order): the per-call override, the
   * injected {@link DailyAllowanceProvider} (the real PlanService lands in task
   * 28), then {@link DEFAULT_DAILY_ALLOWANCE}.
   *
   * @throws 400 INVALID_UTC_DAY         when `utcDay` is not `YYYY-MM-DD`.
   * @throws 400 INVALID_DAILY_ALLOWANCE when the resolved allowance is not a
   *         non-negative whole number of credits.
   */
  async grantDaily(
    ownerRef: OwnerRef,
    utcDay: string,
    options: GrantDailyOptions = {},
  ): Promise<CreditLedgerEntry> {
    if (!nonEmpty(ownerRef?.ownerId)) {
      throw createAppError('ownerRef.ownerId is required', 400, 'OWNER_REF_REQUIRED');
    }
    if (!isUtcDay(utcDay)) {
      throw createAppError('utcDay must be a YYYY-MM-DD UTC-day string', 400, 'INVALID_UTC_DAY');
    }

    // IDEMPOTENCY (Req 17.2): at most one daily_grant per (owner, utcDay). If a
    // grant already exists for this day, return it WITHOUT appending a second
    // grant (and without re-expiring the daily bucket).
    const existing = await this.findDailyGrant(ownerRef.ownerId, utcDay);
    if (existing != null) {
      return existing;
    }

    // Resolve the daily allowance from the per-call override -> injected
    // provider -> default constant.
    const allowance = options.dailyAllowance ?? (await this.dailyAllowanceProvider(ownerRef));
    if (!isNonNegativeWholeCredits(allowance)) {
      throw createAppError(
        'daily allowance must be a non-negative whole number of credits',
        400,
        'INVALID_DAILY_ALLOWANCE',
      );
    }

    // NON-ROLLOVER (Req 17.3): expire the previous day's UNUSED daily remainder
    // so it cannot be spent today. The daily bucket balance == SUM(DAILY
    // entries); appending a negative reconciling entry of exactly that remainder
    // resets the daily bucket to 0 before the new grant. Re-running after a
    // partial failure is safe: the remainder is recomputed from the ledger, so
    // an already-applied expiry yields a remainder of 0 and is not repeated.
    const priorDailyRemainder = await this.dailyBucketBalance(ownerRef.ownerId);
    if (priorDailyRemainder > 0) {
      await this.prisma.creditLedgerEntry.create({
        data: {
          id: this.generateId(),
          ownerRef: ownerRef.ownerId,
          ownerType: ownerRef.ownerType ?? 'user',
          tenantId: ownerRef.tenantId ?? null,
          entryType: 'daily_expiry',
          bucket: 'DAILY',
          amount: -priorDailyRemainder,
          actionKey: `daily-expiry:${ownerRef.ownerId}:${utcDay}`,
          sourceRef: options.sourceRef ?? null,
          utcDay,
          reason: 'daily allowance reset (no rollover of unused remainder)',
        },
      });
    }

    // APPEND EXACTLY ONE daily_grant (Req 17.1) into the DAILY bucket.
    try {
      return await this.prisma.creditLedgerEntry.create({
        data: {
          id: this.generateId(),
          ownerRef: ownerRef.ownerId,
          ownerType: ownerRef.ownerType ?? 'user',
          tenantId: ownerRef.tenantId ?? null,
          entryType: 'daily_grant',
          bucket: 'DAILY',
          amount: allowance,
          actionKey: `daily:${ownerRef.ownerId}:${utcDay}`,
          sourceRef: options.sourceRef ?? null,
          utcDay,
          reason: 'daily free allowance',
        },
      });
    } catch (err) {
      // Lost a race on the @unique actionKey: another concurrent grant won.
      // Return the winning entry so the call still behaves idempotently.
      const winner = await this.findDailyGrant(ownerRef.ownerId, utcDay);
      if (winner != null) {
        return winner;
      }
      throw err;
    }
  }

  /**
   * Debit `amount` whole credits from the wallet, keyed by `actionKey`,
   * consuming buckets in the FIXED order DAILY -> MONTHLY -> PURCHASED (Req
   * 18.2). This is the real ledger-backed primitive the UsageGate settles
   * through (task 27).
   *
   * PRECONDITION: `amount > 0` (whole credits) and `actionKey` is non-empty.
   * PRECONDITION (FAIL CLOSED, Req 18.3): the derived `total` balance must be
   * `>= amount`; otherwise NOTHING is appended and `OUT_OF_CREDITS` is thrown,
   * so the balance can never go negative (Req 16.2).
   * POSTCONDITION: appends one negative debit entry PER consumed bucket, in
   * consumption order, whose magnitudes sum to EXACTLY `amount`.
   * IDEMPOTENCY (Req 18.4): replaying the same `actionKey` appends nothing and
   * returns the prior debit's result. The per-bucket entry keys
   * (`debit:{actionKey}#{bucket}`) are @unique at the DB layer, so a concurrent
   * replay that loses the race returns the winning debit's entries.
   *
   * @throws 400 INVALID_AMOUNT       when `amount` is not a positive whole number.
   * @throws 400 ACTION_KEY_REQUIRED  when `actionKey` is empty.
   * @throws 402 OUT_OF_CREDITS       when `total < amount` (nothing appended).
   */
  async debit(
    ownerRef: OwnerRef,
    amount: Credits,
    actionKey: string,
    options: DebitOptions = {},
  ): Promise<DebitResult> {
    if (!nonEmpty(ownerRef?.ownerId)) {
      throw createAppError('ownerRef.ownerId is required', 400, 'OWNER_REF_REQUIRED');
    }
    if (!isPositiveWholeCredits(amount)) {
      throw createAppError(
        'debit amount must be a positive whole number of credits',
        400,
        'INVALID_AMOUNT',
      );
    }
    if (!nonEmpty(actionKey)) {
      throw createAppError('debit actionKey is required', 400, 'ACTION_KEY_REQUIRED');
    }

    // IDEMPOTENCY (Req 18.4): a prior debit for this actionKey appends nothing
    // and returns the prior result.
    const prior = await this.findDebitEntries(ownerRef.ownerId, actionKey);
    if (prior.length > 0) {
      return this.toDebitResult(actionKey, prior, true);
    }

    // PRECONDITION (FAIL CLOSED, Req 18.3 / 16.2): never let the balance go
    // negative — if the owner cannot fund the debit FROM THE ELIGIBLE BUCKETS,
    // append NOTHING. For a default debit the eligible buckets are all three;
    // for a payout (`consumptionOrder: ['PURCHASED']`) only the earned/purchased
    // balance is eligible, so the check must use that subset — not the grand
    // total — or the plan could sum to less than `amount`.
    const order = options.consumptionOrder ?? CONSUMPTION_ORDER;
    const balance = await this.bucketBalances(ownerRef.ownerId);
    const eligible = order.reduce((sum, bucket) => {
      switch (bucket) {
        case 'DAILY':
          return sum + Math.max(0, balance.daily);
        case 'MONTHLY':
          return sum + Math.max(0, balance.monthly);
        case 'PURCHASED':
          return sum + Math.max(0, balance.purchased);
        default:
          return sum;
      }
    }, 0);
    if (eligible < amount) {
      throw createAppError(
        `Insufficient credits: debit needs ${amount} but only ${eligible} available`,
        402,
        'OUT_OF_CREDITS',
      );
    }

    // CONSUMPTION ORDER (Req 18.2): daily allowance -> monthly -> purchased (or
    // the caller-supplied order, e.g. PURCHASED-only for payouts).
    const plan = this.planConsumption(balance, amount, order);

    // APPEND one negative debit entry per consumed bucket, in order. The
    // magnitudes sum to exactly `amount` (the plan is built to total `amount`).
    const entries: CreditLedgerEntry[] = [];
    try {
      for (const part of plan) {
        const entry = await this.prisma.creditLedgerEntry.create({
          data: {
            id: this.generateId(),
            ownerRef: ownerRef.ownerId,
            ownerType: ownerRef.ownerType ?? 'user',
            tenantId: ownerRef.tenantId ?? null,
            entryType: 'debit',
            bucket: part.bucket,
            amount: -part.amount,
            actionKey: this.debitActionKey(actionKey, part.bucket),
            sourceRef: options.sourceRef ?? null,
            utcDay: null,
            reason: options.reason ?? null,
          },
        });
        entries.push(entry);
      }
    } catch (err) {
      // Lost a race on the @unique actionKey: a concurrent debit with this key
      // won. Return the winning debit's entries so the call stays idempotent.
      if (isUniqueViolation(err)) {
        const winner = await this.findDebitEntries(ownerRef.ownerId, actionKey);
        if (winner.length > 0) {
          return this.toDebitResult(actionKey, winner, true);
        }
      }
      throw err;
    }

    return this.toDebitResult(actionKey, entries, false);
  }

  /**
   * Build the per-bucket consumption plan for a debit of `amount`, drawing from
   * each bucket in {@link CONSUMPTION_ORDER} until satisfied. The caller has
   * already verified `balance.total >= amount`, so the plan always totals
   * exactly `amount`.
   */
  private planConsumption(
    balance: CreditBalance,
    amount: Credits,
    order: readonly CreditBucket[] = CONSUMPTION_ORDER,
  ): Array<{ bucket: CreditBucket; amount: number }> {
    const available: Record<CreditBucket, number> = {
      DAILY: Math.max(0, balance.daily),
      MONTHLY: Math.max(0, balance.monthly),
      PURCHASED: Math.max(0, balance.purchased),
    };
    const plan: Array<{ bucket: CreditBucket; amount: number }> = [];
    let remaining = amount;
    for (const bucket of order) {
      if (remaining <= 0) break;
      const take = Math.min(available[bucket], remaining);
      if (take > 0) {
        plan.push({ bucket, amount: take });
        remaining -= take;
      }
    }
    return plan;
  }

  /** The @unique idempotency key for one bucket's slice of a logical debit. */
  private debitActionKey(actionKey: string, bucket: CreditBucket): string {
    return `debit:${actionKey}#${bucket}`;
  }

  /** All debit ledger rows previously appended for (owner, logical actionKey). */
  private async findDebitEntries(ownerId: string, actionKey: string): Promise<CreditLedgerEntry[]> {
    const prefix = `debit:${actionKey}#`;
    const entries = await this.prisma.creditLedgerEntry.findMany({
      where: { ownerRef: ownerId },
    });
    return entries.filter(
      (e) =>
        e.entryType === 'debit' &&
        typeof e.actionKey === 'string' &&
        e.actionKey.startsWith(prefix),
    );
  }

  /** Summarize a set of debit ledger rows into a {@link DebitResult}. */
  private toDebitResult(
    actionKey: string,
    entries: CreditLedgerEntry[],
    replayed: boolean,
  ): DebitResult {
    const byBucket = { daily: 0, monthly: 0, purchased: 0 };
    for (const e of entries) {
      const mag = Math.abs(Number.isFinite(e.amount) ? e.amount : 0);
      switch (e.bucket) {
        case 'DAILY':
          byBucket.daily += mag;
          break;
        case 'MONTHLY':
          byBucket.monthly += mag;
          break;
        case 'PURCHASED':
        default:
          byBucket.purchased += mag;
          break;
      }
    }
    const total = byBucket.daily + byBucket.monthly + byBucket.purchased;
    return { actionKey, total, byBucket, entries, replayed };
  }

  /** The derived bucket balances for an owner (sum of the append-only ledger). */
  private async bucketBalances(ownerId: string): Promise<CreditBalance> {
    const entries = await this.prisma.creditLedgerEntry.findMany({
      where: { ownerRef: ownerId },
    });
    let daily = 0;
    let monthly = 0;
    let purchased = 0;
    for (const entry of entries) {
      const amount = Number.isFinite(entry.amount) ? entry.amount : 0;
      switch (entry.bucket) {
        case 'DAILY':
          daily += amount;
          break;
        case 'MONTHLY':
          monthly += amount;
          break;
        case 'PURCHASED':
        default:
          purchased += amount;
          break;
      }
    }
    return { daily, monthly, purchased, total: daily + monthly + purchased };
  }

  /** Find the existing `daily_grant` entry for (owner, utcDay), if any. */
  private async findDailyGrant(ownerId: string, utcDay: string): Promise<CreditLedgerEntry | null> {
    return this.prisma.creditLedgerEntry.findFirst({
      where: { ownerRef: ownerId, entryType: 'daily_grant', utcDay },
    });
  }

  /** The current DAILY bucket balance (sum of all DAILY ledger entries). */
  private async dailyBucketBalance(ownerId: string): Promise<number> {
    const entries = await this.prisma.creditLedgerEntry.findMany({
      where: { ownerRef: ownerId },
    });
    let daily = 0;
    for (const entry of entries) {
      if (entry.bucket === 'DAILY') {
        daily += Number.isFinite(entry.amount) ? entry.amount : 0;
      }
    }
    return daily;
  }
}
