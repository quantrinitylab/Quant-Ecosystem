// ============================================================================
// PayoutService — creator/owner withdrawals of EARNED credits to a payout rail
// (UPI / crypto / bank). Part of @quant/credits.
// ============================================================================
//
// MODEL
//   A creator earns credits (creator_payout, boost_earning, streak_reward,
//   marketplace_sale, referral — see EARN_CREDIT_KINDS). Those credits land in
//   the wallet's PURCHASED bucket. A withdrawal turns earned credits into an
//   off-platform payment. The authoritative rules (design "Correctness
//   Properties" 5):
//
//     • NO OVERDRAW OF EARNINGS — a withdrawal of `amount` is rejected unless
//       `amount <= earnedTotal - sum(prior non-failed payouts)`.
//     • PURCHASED-ONLY DEBIT — the debit draws ONLY against the earned/purchased
//       balance (consumptionOrder ['PURCHASED']) so it never burns the user's
//       free DAILY allowance or plan-included MONTHLY credits, and fails closed
//       (OUT_OF_CREDITS) if the earned credits were already spent.
//     • DAILY LIMIT — total non-failed payouts requested in a UTC day may not
//       exceed the configured daily limit.
//     • COMPLIANCE HOLD — a request at/above the configured threshold is held
//       (status `pending_review`) for manual review rather than auto-dispatched;
//       the credits are still reserved (debited) so they cannot be double-spent
//       while under review.
//     • FAIL CLOSED — if the payout rail is not configured we reject BEFORE any
//       debit (PROVIDER_NOT_CONFIGURED); we never reserve funds we cannot pay.
//     • REFUND ON FAILURE — a terminal rail failure appends a compensating
//       credit (kind `adjustment`) restoring the balance and marks the payout
//       `failed`.
//
//   Idempotency: the ledger debit is keyed `payout:{id}` (a fresh crypto id per
//   request), so a retried dispatch never double-debits.

import { createAppError } from './errors';
import type { Credits } from './pricing-engine.service';
import { CreditWallet, type OwnerRef } from './credit-wallet.service';
import {
  ownerOnlyAuthz,
  assertOwnership,
  type OwnershipAuthzPort,
  type OwnershipPrincipal,
} from './ownership-authz';

// ---------------------------------------------------------------------------
// Payout rail port (UPI / crypto / bank) + deterministic fake for tests
// ---------------------------------------------------------------------------

/** A withdrawal method. */
export type PayoutMethod = 'upi' | 'crypto' | 'bank';

/** The terminal lifecycle status of a payout. */
export type PayoutStatus = 'pending' | 'pending_review' | 'processing' | 'completed' | 'failed';

/** The minimal Payout row shape this service reads/writes (mirrors Prisma). */
export interface PayoutRecord {
  id: string;
  ownerRef: string;
  ownerType: string;
  tenantId: string | null;
  amountCredits: number;
  method: string;
  destination: string | null;
  status: string;
  providerRef: string | null;
  reason: string | null;
  requestedAt: Date;
  settledAt: Date | null;
}

/** Input handed to a rail when dispatching a payout. */
export interface PayoutDispatchInput {
  payoutId: string;
  ownerRef: string;
  amountCredits: number;
  method: PayoutMethod;
  destination?: string | undefined;
}

/** Result of a successful rail dispatch. */
export interface PayoutDispatchResult {
  /** The external rail reference (transaction id / payout id). */
  providerRef: string;
}

/**
 * A payout rail (Razorpay payouts / a crypto sender / a bank ACH provider). A
 * real adapter wraps the provider SDK; it MUST fail closed (`isConfigured()` ->
 * false) when its keys are absent, and `dispatch` MUST throw on a terminal
 * failure so the service can refund.
 */
export interface PayoutRail {
  readonly id: string;
  isConfigured(): boolean;
  dispatch(input: PayoutDispatchInput): Promise<PayoutDispatchResult>;
}

export interface FakePayoutRailOptions {
  id?: string;
  configured?: boolean;
  /** When set, `dispatch` throws this to simulate a terminal rail failure. */
  failWith?: Error;
  /** Deterministic provider-ref generator. */
  generateRef?: () => string;
}

/** A deterministic in-memory payout rail for tests. */
export class FakePayoutRail implements PayoutRail {
  readonly id: string;
  private readonly configured: boolean;
  private readonly failWith?: Error;
  private readonly generateRef: () => string;
  readonly dispatched: PayoutDispatchInput[] = [];

  constructor(options: FakePayoutRailOptions = {}) {
    this.id = options.id ?? 'fake-rail';
    this.configured = options.configured ?? true;
    this.failWith = options.failWith;
    this.generateRef = options.generateRef ?? (() => `ref_${globalThis.crypto.randomUUID()}`);
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async dispatch(input: PayoutDispatchInput): Promise<PayoutDispatchResult> {
    if (this.failWith) throw this.failWith;
    this.dispatched.push(input);
    return { providerRef: this.generateRef() };
  }
}

// ---------------------------------------------------------------------------
// PayoutService
// ---------------------------------------------------------------------------

/** The slice of PrismaClient PayoutService needs (so tests can pass a double). */
export interface PayoutPrisma {
  payout: {
    create(args: { data: Record<string, unknown> }): Promise<PayoutRecord>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<PayoutRecord>;
    findMany(args?: { where?: Record<string, unknown> }): Promise<PayoutRecord[]>;
  };
}

export interface PayoutServiceOptions {
  /** Ownership/tenant authorization filter (defaults to owner-only). */
  authz?: OwnershipAuthzPort;
  /** Id generator seam (overridable for deterministic tests). */
  generateId?: () => string;
  /** UTC clock seam (overridable for deterministic tests). */
  now?: () => Date;
  /** Maximum total credits an owner may withdraw per UTC day (default 1000). */
  dailyLimitCredits?: number;
  /**
   * Requests at/above this credit amount are HELD for manual review
   * (`pending_review`) instead of auto-dispatched (default 10000). Set to
   * Infinity to disable holds.
   */
  complianceHoldThreshold?: number;
}

const VALID_METHODS: ReadonlySet<string> = new Set<PayoutMethod>(['upi', 'crypto', 'bank']);

function isPositiveWholeCredits(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n > 0;
}

function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export class PayoutService {
  private readonly authz: OwnershipAuthzPort;
  private readonly generateId: () => string;
  private readonly now: () => Date;
  private readonly dailyLimitCredits: number;
  private readonly complianceHoldThreshold: number;

  constructor(
    private readonly prisma: PayoutPrisma,
    private readonly wallet: CreditWallet,
    private readonly rail: PayoutRail,
    options: PayoutServiceOptions = {},
  ) {
    this.authz = options.authz ?? ownerOnlyAuthz;
    this.generateId = options.generateId ?? (() => globalThis.crypto.randomUUID());
    this.now = options.now ?? (() => new Date());
    this.dailyLimitCredits = options.dailyLimitCredits ?? 1000;
    this.complianceHoldThreshold = options.complianceHoldThreshold ?? 10000;
  }

  /**
   * The amount an owner may still withdraw: gross earned credits minus the sum
   * of prior non-failed payouts. Authz is enforced (owner / tenant-admin only).
   */
  async getWithdrawable(caller: OwnershipPrincipal, ownerRef: OwnerRef): Promise<Credits> {
    const earned = await this.wallet.getEarnedTotal(caller, ownerRef);
    const prior = await this.sumNonFailedPayouts(ownerRef.ownerId);
    return Math.max(0, earned - prior);
  }

  /**
   * Request a withdrawal of `amountCredits` to `method`. See the module header
   * for the full rule set. Returns the resulting Payout record (which may be
   * `completed`, `pending_review`, or `failed`).
   *
   * @throws 400 INVALID_AMOUNT             amount is not a positive whole number.
   * @throws 400 INVALID_PAYOUT_METHOD      method is not upi|crypto|bank.
   * @throws 503 PROVIDER_NOT_CONFIGURED    the rail has no credentials (no debit).
   * @throws 400 WITHDRAWAL_EXCEEDS_EARNED  amount > earned - prior payouts.
   * @throws 400 WITHDRAWAL_LIMIT_EXCEEDED  today's payouts + amount > daily limit.
   * @throws 402 OUT_OF_CREDITS             earned credits already spent (no funds).
   * @throws 403 FORBIDDEN                  caller is not the owner / tenant admin.
   */
  async requestWithdrawal(
    caller: OwnershipPrincipal,
    ownerRef: OwnerRef,
    args: { amountCredits: Credits; method: PayoutMethod; destination?: string },
  ): Promise<PayoutRecord> {
    if (!ownerRef?.ownerId) {
      throw createAppError('ownerRef.ownerId is required', 400, 'OWNER_REF_REQUIRED');
    }
    // AUTHZ GATE: only the owner or a same-tenant admin may withdraw.
    assertOwnership(this.authz, caller, {
      ownerId: ownerRef.ownerId,
      tenantId: ownerRef.tenantId,
      kind: 'payout',
      resourceId: ownerRef.ownerId,
    });

    if (!isPositiveWholeCredits(args?.amountCredits)) {
      throw createAppError(
        'withdrawal amount must be a positive whole number of credits',
        400,
        'INVALID_AMOUNT',
      );
    }
    if (!VALID_METHODS.has(args.method)) {
      throw createAppError(
        `Invalid payout method '${String(args.method)}' (expected upi|crypto|bank)`,
        400,
        'INVALID_PAYOUT_METHOD',
      );
    }

    // FAIL CLOSED: never reserve funds we cannot pay out.
    if (!this.rail.isConfigured()) {
      throw createAppError(
        `Payout rail '${this.rail.id}' is not configured`,
        503,
        'PROVIDER_NOT_CONFIGURED',
      );
    }

    // NO OVERDRAW OF EARNINGS: amount <= earned - prior non-failed payouts.
    const earned = await this.wallet.getEarnedTotal(caller, ownerRef);
    const prior = await this.sumNonFailedPayouts(ownerRef.ownerId);
    const withdrawable = Math.max(0, earned - prior);
    if (args.amountCredits > withdrawable) {
      throw createAppError(
        `Withdrawal exceeds earned balance: requested ${args.amountCredits} but only ${withdrawable} withdrawable`,
        400,
        'WITHDRAWAL_EXCEEDS_EARNED',
      );
    }

    // DAILY LIMIT: today's non-failed payouts + amount must not exceed the cap.
    const today = utcDay(this.now());
    const todays = await this.sumNonFailedPayouts(ownerRef.ownerId, today);
    if (todays + args.amountCredits > this.dailyLimitCredits) {
      throw createAppError(
        `Daily withdrawal limit exceeded: ${todays + args.amountCredits} > ${this.dailyLimitCredits}`,
        400,
        'WITHDRAWAL_LIMIT_EXCEEDED',
      );
    }

    const id = this.generateId();
    const held = args.amountCredits >= this.complianceHoldThreshold;

    // RESERVE FUNDS: debit ONLY the earned/purchased bucket, keyed payout:{id}
    // (idempotent). Fails closed with OUT_OF_CREDITS if the earned credits were
    // already spent (purchased balance < amount).
    await this.wallet.debit(ownerRef, args.amountCredits, `payout:${id}`, {
      consumptionOrder: ['PURCHASED'],
      sourceRef: `payout:${id}`,
      reason: `withdrawal via ${args.method}`,
    });

    const payout = await this.prisma.payout.create({
      data: {
        id,
        ownerRef: ownerRef.ownerId,
        ownerType: ownerRef.ownerType ?? 'user',
        tenantId: ownerRef.tenantId ?? null,
        amountCredits: args.amountCredits,
        method: args.method,
        destination: args.destination ?? null,
        status: held ? 'pending_review' : 'pending',
        providerRef: null,
        reason: held ? 'held for compliance review' : null,
        requestedAt: this.now(),
        settledAt: null,
      },
    });

    // COMPLIANCE HOLD: do not auto-dispatch; a reviewer settles it later.
    if (held) {
      return payout;
    }

    // DISPATCH to the rail. On success complete; on terminal failure refund.
    try {
      const { providerRef } = await this.rail.dispatch({
        payoutId: id,
        ownerRef: ownerRef.ownerId,
        amountCredits: args.amountCredits,
        method: args.method,
        destination: args.destination,
      });
      return await this.prisma.payout.update({
        where: { id },
        data: { status: 'completed', providerRef, settledAt: this.now() },
      });
    } catch (err) {
      // REFUND ON FAILURE: append a compensating credit restoring the balance.
      await this.wallet.credit(ownerRef, {
        amount: args.amountCredits,
        kind: 'adjustment',
        sourceRef: `payout-refund:${id}`,
        reason: 'payout rail failure refund',
      });
      const reason = err instanceof Error ? err.message : 'payout rail failure';
      return this.prisma.payout.update({
        where: { id },
        data: { status: 'failed', reason, settledAt: this.now() },
      });
    }
  }

  /**
   * Sum the credit amounts of an owner's non-failed payouts (optionally scoped
   * to a single UTC day). A failed payout was refunded, so it does not count
   * against the earned balance or the daily limit.
   */
  private async sumNonFailedPayouts(ownerId: string, day?: string): Promise<number> {
    const rows = await this.prisma.payout.findMany({ where: { ownerRef: ownerId } });
    let sum = 0;
    for (const row of rows) {
      if (row.status === 'failed') continue;
      if (day != null && utcDay(new Date(row.requestedAt)) !== day) continue;
      sum += Number.isFinite(row.amountCredits) ? row.amountCredits : 0;
    }
    return sum;
  }
}
