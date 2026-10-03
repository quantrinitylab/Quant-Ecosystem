/**
 * usage-gate.ts — Fastify plugin: QuantMail AI routes par Credits metering enforcement (P0-4, W2).
 *
 * Mount: `await fastify.register(usageGateRoutes, { prisma, wallet?, modelRouter?, ... })`
 *         → koi naya public path NAHI (internal enforcement); decorates:
 *           - `fastify.usageGate` — the wrapped, production-ready gate
 *                                    (UsageGate + D7 model-lock + D3 overage + D2 TTL store)
 *           - `request.checkUsage(input)` — per-request reserve helper (JSON routes ke liye);
 *                                          402/503 throw karta hai, onSend me
 *                                          X-Quant-Credits-Remaining / X-Quant-Credits-Reserved set karta hai
 *           - `fastify.usageGateMetering` — `createStreamMetering()` adapter factory output
 *                                          (P0-6 ai-streaming.ts ke `StreamMetering` seam se byte-compatible)
 *           - `fastify.createStreamMetering(opts)` — per-tier/per-route adapter factory
 *                                          (modelId/modelClass/route ke saath)
 *
 * Staging constraints (ai-streaming/LEARNINGS.md — heavy deps):
 *   - `fastify` TYPE-ONLY import — staging me fastify dep nahi hai; merge-time par real
 *     FastifyInstance milega.
 *   - `@quant/credits` RUNTIME import — ye file P0-4 ka maqsad hi real wiring hai; W1 RESEARCH.md
 *     ke exact exports/signatures use hote hain (usage-gate.service.ts:222/:271/:315,
 *     pricing-engine.service.ts:164, wallet-balance-adapter.ts:71, overage-service.ts:201/:206,
 *     plan-service.ts:680). Staging me @quant/credits resolve nahi hota → ye file + tests
 *     merge-time par run honge (vitest). Syntax esbuild se verify karo.
 *   - Prisma TYPE-ONLY structural interfaces — real PrismaClient merge-time par inject hoga.
 *
 * Fail-closed laws (RESEARCH §2b, §6, D1):
 *   - Gate absent (na wallet, na prisma, na injected gate) aur `disabled` bhi nahi → DENY.
 *     Plugin registration par throw hota hai — AI bina readable ledger ke kabhi proceed nahi karta.
 *   - `disabled: true` = permit-all NOOP — SIRF dev/test ke liye; production me kabhi nahi.
 *     NODE_ENV=production me disabled:true → registration throw karta hai.
 *   - Ledger-down → 503 LEDGER_UNAVAILABLE (retryable); balance-short → 402 OUT_OF_CREDITS
 *     (non-retryable). Silent fail-open FORBIDDEN.
 */

// ---------------------------------------------------------------------------
// Imports — fastify + prisma type-only (staging); @quant/credits REAL (W2 wiring)
// ---------------------------------------------------------------------------

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  UsageGate,
  createWalletBalanceProvider,
  overageDisabledPort,
  permitAllEntitlements,
  PricingEngine,
  createModelRouterCostEstimator,
  fallbackAiCostEstimator,
  DEFAULT_CREDITS_PER_USD,
  isAppError,
  createAppError,
  type BalanceProviderPort,
  type Credits,
  type EntitlementPort,
  type MeteredAction,
  type OveragePolicyPort,
  type Reservation,
  type ReservationStore,
} from '@quant/credits';

// NOTE: barrel exports (raw/index.ts, 279 lines — RESEARCH §1e) me ye sab verified hain:
//   UsageGate, PricingEngine, createModelRouterCostEstimator, fallbackAiCostEstimator,
//   DEFAULT_CREDITS_PER_USD, createWalletBalanceProvider, overageDisabledPort,
//   permitAllEntitlements, isAppError, createAppError + types.
// TODO(UNVERIFIED): `PlanService` class + `createModelAwareEntitlementPort`-jaisa koi helper
//   barrel me verify NAHI kiya — merge-time par `createPlanEntitlementPort` (plan-service.ts:680,
//   verified raw fetch) ke aas-paas D7 wrapper likha gaya hai; agar barrel se PlanService ka
//   exact export path alag nikle to import adjust karo.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** D2: crashed/never-settled reservations ke holds leak na karen — 15 min TTL + lazy sweep. */
export const DEFAULT_RESERVATION_TTL_MS = 15 * 60 * 1000;

/** D6: reserve-time conservative output projection, per AI tier (model router se override ho sakta hai). */
export const TIER_OUTPUT_CAP_TOKENS: Record<string, number> = {
  fast: 1024,
  balanced: 2048,
  deep: 4096,
};

/** D4: unknown modelId par explicit conservative ceiling markup (env-overridable, silent fallback FORBIDDEN). */
export const UNKNOWN_MODEL_MARKUP_ENV = 'QUANTMAIL_UNKNOWN_MODEL_MARKUP';
export const CREDITS_PER_USD_ENV = 'QUANTMAIL_CREDITS_PER_USD';

/** Response headers — sirf credits; X-RateLimit-* alag lane (rate-limit program ka scope). */
export const HDR_CREDITS_REMAINING = 'X-Quant-Credits-Remaining';
export const HDR_CREDITS_RESERVED = 'X-Quant-Credits-Reserved';

// ---------------------------------------------------------------------------
// Prisma structural types (type-only; real PrismaClient merge-time inject hoga)
// ---------------------------------------------------------------------------

/**
 * Minimal structural Prisma surface jo is plugin ko chahiye. Real PrismaClient
 * isse structurally satisfy karta hai (schema: CreditLedgerEntry :2434,
 * UsageReservation — prisma-addendum.prisma, merge-time apply).
 */
export interface UsageGatePrisma {
  creditLedgerEntry: {
    aggregate(args: {
      where: Record<string, unknown>;
      _sum: { amount: true };
    }): Promise<{ _sum: { amount: number | null } }>;
    upsert(args: {
      where: { actionKey: string };
      update: Record<string, never>;
      create: {
        ownerRef: string;
        ownerType: string;
        entryType: 'debit';
        bucket: 'PURCHASED' | 'MONTHLY' | 'DAILY';
        amount: number;
        actionKey: string;
        sourceRef: string;
        reason: string;
      };
    }): Promise<unknown>;
  };
  usageReservation: {
    findUnique(args: { where: { ownerRef_actionKey: { ownerRef: string; actionKey: string } } }): Promise<UsageReservationRow | null>;
    findMany(args: { where: Record<string, unknown> }): Promise<UsageReservationRow[]>;
    create(args: { data: UsageReservationRowInput }): Promise<UsageReservationRow>;
    update(args: { where: { id: string }; data: Partial<UsageReservationRowInput> }): Promise<UsageReservationRow>;
    deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
  };
}

export interface UsageReservationRow {
  id: string;
  ownerRef: string;
  actionKey: string;
  kind: string;
  estimatedCost: number;
  settled: boolean;
  actualCost: number | null;
  overage: boolean;
  createdAt: Date;
  settledAt: Date | null;
  expiresAt: Date;
}

export interface UsageReservationRowInput {
  id: string;
  ownerRef: string;
  actionKey: string;
  kind: string;
  estimatedCost: number;
  settled: boolean;
  actualCost?: number | null;
  overage?: boolean;
  createdAt?: Date;
  settledAt?: Date | null;
  expiresAt: Date;
}

// ---------------------------------------------------------------------------
// 1. Prisma-backed BalanceProviderPort — `balance == SUM(amount)` (schema :2434)
// ---------------------------------------------------------------------------

/**
 * Real ledger reader: `getBalance = SUM(credit_ledger_entries.amount)` per ownerRef
 * (CreditLedgerEntry.amount SIGNED hai — balance == SUM(amount), schema.prisma:2434 verified).
 *
 * D1: DB down/throw → 503 LEDGER_UNAVAILABLE (fail CLOSED). Silent fail-open FORBIDDEN.
 * `recordSettlement` yahan OPTIONAL hai — production me `createWalletBalanceProvider`
 * (wallet-balance-adapter.ts:71, verified) use hota hai jo DAILY→MONTHLY→PURCHASED
 * bucket order me debit karta hai. Ye class ka direct-debit fallback sirf tab jab
 * `wallet` inject NAHI hua (dev/merge-transition); bucket-order caveat NOTES.md me darj hai.
 */
export class PrismaBalancePort implements BalanceProviderPort {
  constructor(
    private readonly prisma: UsageGatePrisma,
    private readonly isOverageHold: (reservationId: string) => boolean | Promise<boolean> = () => false,
  ) {}

  async getBalance(ownerRef: string): Promise<number> {
    try {
      const agg = await this.prisma.creditLedgerEntry.aggregate({
        where: { ownerRef },
        _sum: { amount: true },
      });
      return Math.max(0, agg._sum.amount ?? 0);
    } catch (err) {
      // D1 — ledger unreadable => DENY (fail closed), retryable 503, NOT 402.
      throw createAppError('Credit ledger unavailable', 503, 'LEDGER_UNAVAILABLE');
    }
  }

  /**
   * Direct ledger debit, `actionKey` @@unique par upsert → idempotent (double-settle
   * replay no-op; schema.prisma:2434 `@@unique([actionKey])` verified).
   * TODO(UNVERIFIED): production me CreditWallet.debit ka DAILY→MONTHLY→PURCHASED bucket-order
   *   path prefer karo (wallet-balance-adapter). Ye fallback PURCHASED bucket me seedha
   *   debit karta hai — merge-time par wallet wiring verify karo.
   */
  async recordSettlement(
    ownerRef: string,
    actualCost: Credits,
    reservation: Reservation,
  ): Promise<void> {
    const cost = Math.max(0, Math.floor(Number.isFinite(actualCost) ? actualCost : 0));
    if (cost <= 0) return; // wallet-balance-adapter.ts:87-90 se match: zero settlement debits nothing
    const overage = await this.isOverageHold(reservation.id);
    try {
      await this.prisma.creditLedgerEntry.upsert({
        where: { actionKey: reservation.actionKey },
        update: {},
        create: {
          ownerRef,
          ownerType: 'user',
          entryType: 'debit',
          bucket: 'PURCHASED',
          amount: -cost,
          actionKey: reservation.actionKey,
          sourceRef: reservation.id,
          // D3: overage portion ledger me mark hota hai (monthly ceiling accounting ka source).
          reason: overage ? 'overage' : `settlement:${reservation.kind}`,
        },
      });
    } catch (err) {
      // Settle-time debit failure: response already sent ho sakti hai (fire-and-forget path).
      // Fail CLOSED matlab yahan throw NAHI karte — alert ke liye rethrow with 503 code
      // taaki caller log+alert kar sake; debit retry actionKey idempotency se safe hai.
      throw createAppError('Credit ledger debit failed', 503, 'LEDGER_UNAVAILABLE');
    }
  }
}

// ---------------------------------------------------------------------------
// 2. ReservationStore with TTL (D2) — in-memory (dev/test) + Prisma (production)
// ---------------------------------------------------------------------------

/** Hamara extension: overage-marked holds ko settle-time par pehchanna zaroori hai (D3). */
export interface OverageAwareStore extends ReservationStore {
  /** true agar ye reservation overage path se mint hui thi. */
  isOverageHold(reservationId: string): boolean | Promise<boolean>;
  /** Expired unsettled holds ko drop karo (lazy sweep; best-effort). */
  sweepExpired(now?: Date): void | Promise<void>;
}

function isExpired(r: Reservation, ttlMs: number, now: number): boolean {
  return !r.settled && now - r.createdAt.getTime() > ttlMs;
}

/**
 * D2: In-memory store + 15-min TTL + lazy sweep. Dev/test ke liye; production me
 * PrismaReservationStore (multi-instance safe — RESEARCH TODO#6 ka answer).
 */
export class TtlReservationStore implements OverageAwareStore {
  private readonly byKey = new Map<string, Reservation & { overage?: boolean }>();
  private readonly overageIds = new Set<string>();

  constructor(private readonly ttlMs: number = DEFAULT_RESERVATION_TTL_MS) {}

  private key(ownerRef: string, actionKey: string): string {
    return `${ownerRef}::${actionKey}`;
  }

  sweepExpired(now: Date = new Date()): void {
    const t = now.getTime();
    for (const [k, r] of this.byKey) {
      if (isExpired(r, this.ttlMs, t)) {
        this.byKey.delete(k);
        this.overageIds.delete(r.id);
      }
    }
  }

  get(ownerRef: string, actionKey: string): Reservation | undefined {
    this.sweepExpired();
    return this.byKey.get(this.key(ownerRef, actionKey));
  }

  put(reservation: Reservation): void {
    this.sweepExpired();
    const overage = (reservation as { overage?: boolean }).overage === true;
    this.byKey.set(this.key(reservation.ownerRef, reservation.actionKey), { ...reservation, overage });
    if (overage) this.overageIds.add(reservation.id);
  }

  update(reservation: Reservation): void {
    const prev = this.byKey.get(this.key(reservation.ownerRef, reservation.actionKey));
    const overage =
      (reservation as { overage?: boolean }).overage === true || prev?.overage === true;
    this.byKey.set(this.key(reservation.ownerRef, reservation.actionKey), { ...reservation, overage });
    if (overage) this.overageIds.add(reservation.id);
  }

  listOpen(ownerRef: string): Reservation[] {
    this.sweepExpired();
    const open: Reservation[] = [];
    for (const r of this.byKey.values()) {
      if (r.ownerRef === ownerRef && !r.settled) open.push(r);
    }
    return open;
  }

  isOverageHold(reservationId: string): boolean {
    return this.overageIds.has(reservationId);
  }
}

function rowToReservation(row: UsageReservationRow): Reservation & { overage: boolean } {
  return {
    id: row.id,
    ownerRef: row.ownerRef,
    actionKey: row.actionKey,
    kind: row.kind as Reservation['kind'],
    estimatedCost: row.estimatedCost,
    settled: row.settled,
    actualCost: row.actualCost ?? undefined,
    createdAt: row.createdAt,
    settledAt: row.settledAt ?? undefined,
    overage: row.overage,
  };
}

/**
 * D2 + multi-instance: Prisma-backed ReservationStore. `UsageReservation` model
 * (prisma-addendum.prisma — merge-time apply) me `expiresAt` + `overage` columns.
 * Lazy sweep: har reserve par expired unsettled rows ka best-effort deleteMany.
 */
export class PrismaReservationStore implements OverageAwareStore {
  constructor(
    private readonly prisma: UsageGatePrisma,
    private readonly ttlMs: number = DEFAULT_RESERVATION_TTL_MS,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async sweepExpired(now: Date = this.clock()): Promise<void> {
    try {
      await this.prisma.usageReservation.deleteMany({
        where: { settled: false, expiresAt: { lt: now } },
      });
    } catch {
      /* sweep best-effort hai — get/listOpen expiry ko waise bhi ignore karte hain */
    }
  }

  async get(ownerRef: string, actionKey: string): Promise<Reservation | undefined> {
    const row = await this.prisma.usageReservation.findUnique({
      where: { ownerRef_actionKey: { ownerRef, actionKey } },
    });
    if (!row) return undefined;
    // Lazy expiry: expired unsettled hold = absent (balance leak nahi).
    if (!row.settled && row.expiresAt.getTime() < this.clock().getTime()) return undefined;
    return rowToReservation(row);
  }

  async put(reservation: Reservation): Promise<void> {
    const createdAt = reservation.createdAt ?? this.clock();
    await this.prisma.usageReservation.create({
      data: {
        id: reservation.id,
        ownerRef: reservation.ownerRef,
        actionKey: reservation.actionKey,
        kind: reservation.kind,
        estimatedCost: reservation.estimatedCost,
        settled: false,
        actualCost: null,
        overage: (reservation as { overage?: boolean }).overage === true,
        createdAt,
        settledAt: null,
        expiresAt: new Date(createdAt.getTime() + this.ttlMs),
      },
    });
  }

  async update(reservation: Reservation): Promise<void> {
    await this.prisma.usageReservation.update({
      where: { id: reservation.id },
      data: {
        settled: reservation.settled,
        actualCost: reservation.actualCost ?? null,
        settledAt: reservation.settledAt ?? null,
      },
    });
  }

  async listOpen(ownerRef: string): Promise<Reservation[]> {
    const rows = await this.prisma.usageReservation.findMany({
      where: { ownerRef, settled: false, expiresAt: { gt: this.clock() } },
    });
    return rows.map(rowToReservation);
  }

  async isOverageHold(reservationId: string): Promise<boolean> {
    // Cross-process safe: flag DB row me persisted hai (in-process Set par bharosa nahi).
    const rows = await this.prisma.usageReservation.findMany({ where: { id: reservationId } });
    return rows.some((r) => r.overage);
  }
}

// ---------------------------------------------------------------------------
// 3. D7 — model-aware entitlement port (createPlanEntitlementPort ka modelId-drop gap fix)
// ---------------------------------------------------------------------------

/**
 * D7. `createPlanEntitlementPort` (plan-service.ts:680, verified) gate ke
 * `permits(ownerRef, kind)` me map hota hai aur `modelId` DROP kar deta hai —
 * tier→model pins (free sirf gpt-4o-mini-tier) enforce nahi hote (RESEARCH §1c).
 *
 * Ye port wahi gap fix karta hai: `permitsWithModel(ownerRef, kind, modelId?)`
 * `PlanService.permits(owner, kind, { modelId })` (plan-service.ts:427, verified
 * signature) ko forward karta hai → MODEL LOCK enforce hota hai.
 *
 * ANTI-DOUBLE-COUNT law (verified plan-service.ts permits body): permits() success par
 * rate-limit windows COUNT karta hai. Isliye production wiring me gate ke `entitlements`
 * slot me `permitAllEntitlements` rehta hai aur entitlement EXACTLY EK BAAR yahan
 * (QuantmailUsageGate.checkAndReserve ke andar, idempotency check ke BAAD) evaluate
 * hota hai — warna free tier ka 10/min window har request par 2 token kha jayega.
 * (W1 D7 se implementation-level refinement — RESEARCH §8 me darj.)
 */
export interface ModelAwareEntitlementPort extends EntitlementPort {
  permitsWithModel(
    ownerRef: string,
    kind: MeteredAction['kind'],
    modelId?: string,
  ): boolean | Promise<boolean>;
}

export interface PlanServiceLike {
  permits(
    ownerRef: { ownerId: string },
    kind: MeteredAction['kind'],
    options?: { modelId?: string },
  ): Promise<boolean>;
}

/**
 * @param planService — real `PlanService` (packages/credits). Type yahan structural hai
 *   taaki staging me type-only rahe; merge-time par real instance inject karo.
 */
export function createModelAwareEntitlementPort(
  planService: PlanServiceLike,
): ModelAwareEntitlementPort {
  return {
    // Gate ke slot ke liye — production wiring me gate isko use NAHI karta
    // (anti-double-count; dekho upar). Sirf interface conformance.
    permits(ownerRef, kind) {
      return planService.permits({ ownerId: ownerRef }, kind);
    },
    // D7: modelId forward hota hai — tier→model pins enforce.
    permitsWithModel(ownerRef, kind, modelId) {
      return planService.permits({ ownerId: ownerRef }, kind, { modelId });
    },
  };
}

// ---------------------------------------------------------------------------
// 4. QuantmailUsageGate — real UsageGate + D7 model-lock + D3 overage + D2 sweep
// ---------------------------------------------------------------------------

export interface QuantmailUsageGateOptions {
  /** The REAL @quant/credits UsageGate (wired by the plugin; tests inject directly). */
  inner: UsageGate;
  /** Wahi store instance jo `inner` ko diya gaya (overage holds isi me mint hote hain). */
  store: OverageAwareStore;
  /** D7 port; absent → entitlement check skip (dev). Production me REQUIRED. */
  entitlements?: ModelAwareEntitlementPort;
  /** D3: default `overageDisabledPort` (fail-closed) — RESEARCH §1d. */
  overagePort?: OveragePolicyPort;
  /** D3: is UTC mahine me kitna overage already spend hua (ledger query). */
  monthlyOverageUsed?: (ownerRef: string) => Promise<number>;
  /** Reservation-id generator seam. */
  generateId?: () => string;
  /** D2 sweep hook. */
  sweepOnReserve?: boolean;
}

function isOverageReservation(r: Reservation): boolean {
  return (r as { overage?: boolean }).overage === true;
}

/**
 * Production gate facade. `UsageGate` ka public surface preserve karta hai
 * (estimateCost / getAvailableBalance / getReservation / checkAndReserve / settle)
 * aur uske upar:
 *  - D7: `permitsWithModel` — tier→model pins (idempotent retry par skip: gate
 *        existing reservation ko permits se PEHLE return karta hai, wahi yahan).
 *  - D3: OUT_OF_CREDITS par overage consult — enabled + monthly ceiling ke andar →
 *        hold mint (store.put, `overage: true` mark) aur proceed. Default OFF.
 *  - D2: reserve par lazy sweep.
 *
 * Over-mint race note: do concurrent overage reserves ceiling ko thoda overshoot kar
 * sakte hain (check-then-act). Ledger `reason:'overage'` audit truth hai; ceiling
 * best-effort per-request enforcement hai — NOTES.md §security me darj.
 */
export class QuantmailUsageGate {
  private readonly generateId: () => string;

  constructor(
    private readonly inner: UsageGate,
    private readonly opts: QuantmailUsageGateOptions,
  ) {
    this.generateId = opts.generateId ?? (() => globalThis.crypto.randomUUID());
  }

  estimateCost(action: MeteredAction): Credits {
    return this.inner.estimateCost(action);
  }

  getAvailableBalance(ownerRef: string): Promise<Credits> {
    return this.inner.getAvailableBalance(ownerRef);
  }

  getReservation(ownerRef: string, actionKey: string): Promise<Reservation | undefined> {
    return this.inner.getReservation(ownerRef, actionKey);
  }

  /**
   * @throws 402 UPGRADE_REQUIRED — plan permits nahi karta (D7 model-lock samet)
   * @throws 402 OUT_OF_CREDITS — balance kam AUR (overage off ya ceiling cross)
   * @throws 503 LEDGER_UNAVAILABLE — D1, retryable
   */
  async checkAndReserve(ownerRef: string, action: MeteredAction): Promise<Reservation> {
    if (this.opts.sweepOnReserve !== false) {
      await this.opts.store.sweepExpired();
    }

    // Idempotency FIRST — gate ki tarah: existing reservation → return as-is,
    // bina dobara permits/rate-count ke (plan-service.ts verified behavior).
    const existing = await this.inner.getReservation(ownerRef, action.actionKey);
    if (existing) return existing;

    // D7: model-lock (exactly once — gate ka entitlements slot permitAll hai).
    if (this.opts.entitlements) {
      const allowed = await this.opts.entitlements.permitsWithModel(
        ownerRef,
        action.kind,
        action.modelId,
      );
      if (!allowed) {
        throw createAppError(
          `Your plan does not permit '${action.kind}'${action.modelId ? ` on model '${action.modelId}'` : ''}`,
          402,
          'UPGRADE_REQUIRED',
        );
      }
    }

    try {
      return await this.inner.checkAndReserve(ownerRef, action);
    } catch (err) {
      // D3: sirf OUT_OF_CREDITS par overage consult hota hai — baaki errors passthrough.
      if (!isAppError(err) || err.code !== 'OUT_OF_CREDITS') throw err;
      return this.tryOverageReserve(ownerRef, action, err);
    }
  }

  private async tryOverageReserve(
    ownerRef: string,
    action: MeteredAction,
    original: Error,
  ): Promise<Reservation> {
    const port = this.opts.overagePort ?? overageDisabledPort;
    let policy: { enabled: boolean; monthlyLimitCredits: number };
    try {
      policy = await port.getPolicy(ownerRef);
    } catch {
      throw original; // policy read fail → fail closed, original 402
    }
    if (!policy.enabled || policy.monthlyLimitCredits <= 0) throw original;

    const estimate = this.inner.estimateCost(action);
    const available = await this.inner.getAvailableBalance(ownerRef);
    const shortfall = Math.max(0, estimate - available);
    if (shortfall <= 0) throw original; // race: balance ab cover karta hai → original error hi sahi

    // Ceiling accounting ke bina overage allow karna = ceiling bypass → fail CLOSED.
    const counter = this.opts.monthlyOverageUsed;
    if (!counter) throw original;
    const used = await counter(ownerRef);
    if (used + shortfall > policy.monthlyLimitCredits) throw original; // ceiling cross → 402

    // Hold mint — inner gate isko settle-time par honor karega (store re-fetch,
    // usage-gate.service.ts:315 verified: "We do not trust the passed object").
    const reservation: Reservation & { overage: true } = {
      id: this.generateId(),
      ownerRef,
      actionKey: action.actionKey,
      kind: action.kind,
      estimatedCost: estimate,
      settled: false,
      createdAt: new Date(),
      overage: true,
    };
    await this.opts.store.put(reservation);
    return reservation;
  }

  /**
   * @throws 404 RESERVATION_NOT_FOUND — bina hold ke settle impossible (inner gate invariant)
   * Double-settle = no-op (inner gate verified).
   */
  settle(reservation: Reservation, actualCost: Credits): Promise<Reservation> {
    return this.inner.settle(reservation, actualCost);
  }

  /** Test/ops seam: kya ye reservation overage-marked hai. */
  async isOverageHold(reservationId: string): Promise<boolean> {
    const byStore = await this.opts.store.isOverageHold(reservationId);
    return byStore;
  }
}

// ---------------------------------------------------------------------------
// 5. Monthly overage accounting — ledger query (naya table NAHI, RESEARCH D3)
// ---------------------------------------------------------------------------

/**
 * D3: is UTC mahine me overage-marked debits ka total (credits). Source of truth =
 * `credit_ledger_entries` jahan `entryType='debit'` aur `reason='overage'`
 * (settle-time par PrismaBalancePort / wallet adapter likhta hai).
 */
export function createMonthlyOverageUsed(
  prisma: UsageGatePrisma,
  clock: () => Date = () => new Date(),
): (ownerRef: string) => Promise<number> {
  return async (ownerRef: string): Promise<number> => {
    const now = clock();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    try {
      const agg = await prisma.creditLedgerEntry.aggregate({
        where: {
          ownerRef,
          entryType: 'debit',
          reason: 'overage',
          createdAt: { gte: monthStart },
        },
        _sum: { amount: true },
      });
      return Math.abs(agg._sum.amount ?? 0); // debits negative amount me store hote hain
    } catch {
      // Accounting read fail → fail CLOSED: overage path deny (0 used assume karna
      // ceiling ko bypass kar dega — isliye throw, caller original 402 rethrow karega).
      throw createAppError('Overage accounting unavailable', 503, 'LEDGER_UNAVAILABLE');
    }
  };
}

// ---------------------------------------------------------------------------
// 6. Overage-aware BalanceProviderPort — settle-time `reason: 'overage'` (D3)
// ---------------------------------------------------------------------------

/**
 * D3 settle path: overage-marked holds ka ledger debit `reason='overage'` se jata hai,
 * normal holds ka `reason='settlement:<kind>'`. Do pre-built wallet ports me se
 * per-settlement choose karta hai — flag `UsageReservation.overage` column
 * (cross-process safe) ya store sidecar se padha jata hai.
 */
export class OverageAwareBalancePort implements BalanceProviderPort {
  constructor(
    private readonly normal: BalanceProviderPort,
    private readonly overage: BalanceProviderPort,
    private readonly store: OverageAwareStore,
  ) {}

  getBalance(ownerRef: string): number | Promise<number> {
    return this.normal.getBalance(ownerRef);
  }

  async recordSettlement(
    ownerRef: string,
    actualCost: Credits,
    reservation: Reservation,
  ): Promise<void> {
    let isOver = isOverageReservation(reservation);
    if (!isOver) {
      try {
        isOver = await this.store.isOverageHold(reservation.id);
      } catch {
        isOver = false; // flag read fail → normal path (debit to hoga; reason best-effort)
      }
    }
    const port = isOver ? this.overage : this.normal;
    await port.recordSettlement?.(ownerRef, actualCost, reservation);
  }
}

// ---------------------------------------------------------------------------
// 7. Error → HTTP mapping (ai-streaming "hijack se pehle JSON" pattern)
// ---------------------------------------------------------------------------

export interface HttpUsageError {
  status: number;
  code: string;
  message: string;
}

/**
 * Gate/app errors ko HTTP envelope me map karta hai. Unknown metering errors →
 * 500 (fail-closed: deny). 429 QUOTA_EXHAUSTED mapping forward-compat ke liye hai —
 * plugin khud ise fabricate NAHI karta (plan rate-window denies gate design ke
 * mutabiq UPGRADE_REQUIRED/402 hain); route-level limiters (jaise ai-streaming ka
 * token-bucket) 429 ke owner hain. BOARD_MSG.md me 402-vs-429 semantics darj hain.
 */
export function mapUsageErrorToHttp(err: unknown): HttpUsageError {
  if (isAppError(err)) {
    switch (err.code) {
      case 'UPGRADE_REQUIRED':
        return { status: 402, code: err.code, message: err.message };
      case 'OUT_OF_CREDITS':
        return { status: 402, code: err.code, message: err.message };
      case 'RESERVATION_NOT_FOUND':
        return { status: 404, code: err.code, message: err.message };
      case 'LEDGER_UNAVAILABLE':
        return { status: 503, code: err.code, message: err.message };
      case 'QUOTA_EXHAUSTED':
        return { status: 429, code: err.code, message: err.message };
      default:
        break;
    }
    if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600) {
      return { status: err.statusCode, code: err.code, message: err.message };
    }
  }
  return { status: 500, code: 'METERING_FAILED', message: 'Usage metering failed (fail-closed)' };
}

// ---------------------------------------------------------------------------
// 8. MeteringEvent — quantai-mind alignment (emit-only seam, persist NAHI)
// ---------------------------------------------------------------------------

/**
 * quantai-mind ke MeteringEvent shape se align (RESEARCH appendix).
 * `estimatedCostUsd: null` = unknown — SILENT 0 FORBIDDEN (null-not-0 law).
 * Emit-only: sentinel/observability ke liye; spend authorization UsageGate ke paas hai.
 * TODO(UNVERIFIED): merge-time par quantai-mind ke exact field names se cross-check karo.
 */
export interface MeteringEvent {
  actionKey: string;
  ownerRef: string;
  kind: MeteredAction['kind'];
  phase: 'reserved' | 'settled';
  tokens: { input: number; output: number };
  /** USD estimate; null = unknown. Kabhi silent 0 nahi. */
  estimatedCostUsd: number | null;
  /** Settle par final credits (present only phase='settled'). */
  actualCostCredits?: number;
  /** D4: true jab modelId unknown tha aur ceiling markup laga. */
  costEstimated?: boolean;
  /** D3: true jab ye reservation overage path se mint hui. */
  overage?: boolean;
}

// ---------------------------------------------------------------------------
// 9. createStreamMetering — P0-6 StreamMetering seam par REAL gate adapter (D5, D8)
// ---------------------------------------------------------------------------

/** Staged ai-streaming.ts:40-52 ke saath byte-compatible (wahi method signatures). */
export interface StreamMetering {
  reserve(userId: string, estTokens: number): Promise<ReserveResult>;
  settle(userId: string, reservationId: string | undefined, actualTokens: number): Promise<void>;
}

export type ReserveResult =
  | { ok: true; reservationId?: string; creditsRemaining?: number; creditsReserved?: number }
  | { ok: false; code: string };

/** Koi bhi gate-like object jo adapter chala sake (QuantmailUsageGate ya raw UsageGate). */
export interface MeteredGateLike {
  estimateCost(action: MeteredAction): Credits;
  getAvailableBalance(ownerRef: string): Promise<Credits>;
  getReservation(ownerRef: string, actionKey: string): Promise<Reservation | undefined>;
  checkAndReserve(ownerRef: string, action: MeteredAction): Promise<Reservation>;
  settle(reservation: Reservation, actualCost: Credits): Promise<Reservation>;
}

export interface StreamMeteringOptions {
  /** Concrete model id; undefined → D4 ceiling path (metadata.costEstimated=true). */
  modelId?: string;
  /** Tier → modelClass mapping (fast|balanced|deep); default 'balanced'. */
  modelClass?: string;
  /** Audit metadata (route name, etc.). */
  route?: string;
  /** D6: reserve-time conservative output projection (default = tier cap). */
  estimateOutputTokens?: number;
  /** $1 = N credits (default DEFAULT_CREDITS_PER_USD=1000; env QUANTMAIL_CREDITS_PER_USD). */
  creditsPerUsd?: number;
  /** Emit-only metering events (sentinel/observability). */
  onMeteringEvent?: (event: MeteringEvent) => void;
  /** actionKey generator seam (tests me deterministic). */
  generateActionKey?: () => string;
  /** Settle-miss/alert hook (reservation unknown/expired — response fail NAHI hoti). */
  onSettleMiss?: (info: { userId: string; reservationId?: string; reason: string }) => void;
}

/**
 * D5 + D8. P0-6 ke staged `StreamMetering` seam par real gate:
 *
 * reserve(userId, estTokens):
 *   - `estTokens` = caller-measured PROMPT tokens (ceil(prompt.length/4), engine-consistent —
 *     staged ai-streaming.ts:518 yahi bhejta hai).
 *   - D6: `projectedTokens.output` = tier ka conservative cap (over-reserve → settle par refund).
 *   - D4: `modelId` unknown → metadata.costEstimated=true (+ plugin-level ceiling markup rule).
 *   - actionKey = server-generated uuid per request (RESEARCH §6.2 — do requests kabhi
 *     same actionKey share na karein).
 *   - 402 codes map hote hain (UPGRADE_REQUIRED / OUT_OF_CREDITS); hijack se PEHLE.
 *
 * settle(userId, reservationId, actualTokens):
 *   - `actualTokens` = caller-measured OUTPUT tokens (ceil(accumulated.length/4)) ya -1 = unknown.
 *   - **actualTokens = -1 → `reservation.estimatedCost` par settle (conservative).**
 *   - **Bare -1 ko gate.settle me pass karna FORBIDDEN** — gate ka `ceil(max(0,-1))` = 0
 *     silent debit hota = free AI (RESEARCH §5c). Ye adapter us path ko kabhi hit nahi karta.
 *   - Reservation missing/expired → log+alert hook, response fail NAHI hoti (already sent).
 *   - Metering failures kabhi stream ko break nahi karte (staged finally-block law).
 */
export function createStreamMetering(
  gate: MeteredGateLike,
  opts: StreamMeteringOptions = {},
): StreamMetering {
  const creditsPerUsd = opts.creditsPerUsd ?? DEFAULT_CREDITS_PER_USD;
  const generateActionKey =
    opts.generateActionKey ?? (() => globalThis.crypto.randomUUID());
  const modelClass = opts.modelClass ?? 'balanced';

  // Request-scoped: reservationId → reserve-time context (settle ko poora context chahiye).
  const inflight = new Map<
    string,
    { ownerRef: string; actionKey: string; promptTokens: number; action: MeteredAction }
  >();

  const emit = (e: MeteringEvent) => {
    try {
      opts.onMeteringEvent?.(e);
    } catch {
      /* emit-only seam kabhi metering ko break nahi karta */
    }
  };
  const miss = (info: { userId: string; reservationId?: string; reason: string }) => {
    try {
      opts.onSettleMiss?.(info);
    } catch {
      /* alert hook best-effort */
    }
  };

  function usdFor(credits: Credits): number | null {
    if (!Number.isFinite(credits) || creditsPerUsd <= 0) return null; // null-not-0 law
    return credits / creditsPerUsd;
  }

  return {
    async reserve(userId: string, estTokens: number): Promise<ReserveResult> {
      const promptTokens = Math.max(0, Math.floor(Number.isFinite(estTokens) ? estTokens : 0));
      const outputCap =
        opts.estimateOutputTokens ?? TIER_OUTPUT_CAP_TOKENS[modelClass] ?? TIER_OUTPUT_CAP_TOKENS.balanced;
      const costEstimated = opts.modelId == null || opts.modelId === '';
      const action: MeteredAction = {
        actionKey: `${generateActionKey()}:ai_inference`,
        kind: 'ai_inference',
        ownerRef: userId,
        modelId: opts.modelId || undefined,
        modelClass,
        projectedTokens: { input: promptTokens, output: outputCap },
        metadata: {
          route: opts.route ?? 'ai-stream',
          costEstimated, // D4: unknown model → ceiling markup path
        },
      };
      try {
        const reservation = await gate.checkAndReserve(userId, action);
        inflight.set(reservation.id, { ownerRef: userId, actionKey: action.actionKey, promptTokens, action });
        const remaining = await gate.getAvailableBalance(userId);
        emit({
          actionKey: action.actionKey,
          ownerRef: userId,
          kind: 'ai_inference',
          phase: 'reserved',
          tokens: { input: promptTokens, output: outputCap },
          estimatedCostUsd: usdFor(reservation.estimatedCost),
          costEstimated,
          overage: isOverageReservation(reservation),
        });
        return {
          ok: true,
          reservationId: reservation.id,
          creditsRemaining: remaining,
          creditsReserved: reservation.estimatedCost,
        };
      } catch (err) {
        const code = isAppError(err) ? err.code : 'METERING_FAILED';
        return { ok: false, code };
      }
    },

    async settle(userId: string, reservationId: string | undefined, actualTokens: number): Promise<void> {
      const slot = reservationId != null ? inflight.get(reservationId) : undefined;
      if (!slot) {
        // Unknown/expired reservation (TTL sweep ya crash) — log+alert, response fail mat karo.
        miss({ userId, reservationId, reason: 'unknown-or-expired-reservation' });
        return;
      }
      inflight.delete(reservationId as string);

      let reservation: Reservation | undefined;
      try {
        reservation = await gate.getReservation(slot.ownerRef, slot.actionKey);
      } catch {
        miss({ userId, reservationId, reason: 'reservation-lookup-failed' });
        return;
      }
      if (!reservation) {
        miss({ userId, reservationId, reason: 'reservation-not-found' });
        return;
      }

      // D5: actualTokens unknown (-1) → estimatedCost par settle (conservative).
      // Bare -1 gate.settle tak KABHI nahi pahunchta (silent 0-debit = free AI — FORBIDDEN).
      let actualCost: Credits;
      let measuredOutput: number | null = null;
      if (!Number.isFinite(actualTokens) || actualTokens < 0) {
        actualCost = reservation.estimatedCost;
      } else {
        measuredOutput = Math.max(0, Math.floor(actualTokens));
        actualCost = gate.estimateCost({
          ...slot.action,
          projectedTokens: { input: slot.promptTokens, output: measuredOutput },
        });
      }

      try {
        const settled = await gate.settle(reservation, actualCost);
        emit({
          actionKey: slot.actionKey,
          ownerRef: slot.ownerRef,
          kind: 'ai_inference',
          phase: 'settled',
          tokens: {
            input: slot.promptTokens,
            output: measuredOutput ?? slot.action.projectedTokens?.output ?? 0,
          },
          estimatedCostUsd: usdFor(settled.actualCost ?? actualCost),
          actualCostCredits: settled.actualCost ?? actualCost,
          costEstimated: slot.action.metadata?.costEstimated === true,
          overage: isOverageReservation(settled),
        });
      } catch (err) {
        // 404 RESERVATION_NOT_FOUND (double-settle race) ya ledger error — log+alert only.
        miss({
          userId,
          reservationId,
          reason: `settle-failed:${isAppError(err) ? err.code : 'unknown'}`,
        });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 10. Fastify plugin — usageGateRoutes / registerUsageGate
// ---------------------------------------------------------------------------

export interface UsageGatePluginOptions {
  /**
   * Pre-built gate (tests / advanced wiring). Diya gaya to baaki build options
   * ignore hote hain (prisma/modelRouter sirf default build ke liye).
   */
  gate?: QuantmailUsageGate;
  /** Real PrismaClient (structural). Na wallet na prisma → fail-closed DENY (neeche). */
  prisma?: UsageGatePrisma;
  /**
   * Real CreditWallet instance (packages/credits). Diya gaya to settlement debits
   * `createWalletBalanceProvider` (verified adapter) se hote hain — preferred path.
   * Type structural hai (staging type-only); merge-time par real wallet inject karo.
   */
  wallet?: {
    getBalance(caller: unknown, owner: unknown): Promise<{ total: number }>;
    debit(owner: unknown, cost: number, actionKey: string, opts?: Record<string, unknown>): Promise<unknown>;
  };
  /** @quant/ai ModelRouter (structural) — D4: real token→$ rates. Na ho to fail-closed. */
  modelRouter?: {
    getModels(): Array<{ id: string; costPerInputToken: number; costPerOutputToken: number }>;
  };
  /** Fully-configured PricingEngine (tests / advanced). modelRouter ka alternative. */
  pricing?: PricingEngine;
  /** D7 port (PlanService-backed). Absent → model-lock skip (dev); production me REQUIRED. */
  entitlementPort?: ModelAwareEntitlementPort;
  /** D3: default overageDisabledPort (fail-closed). */
  overagePort?: OveragePolicyPort;
  /** D2: reservation TTL (default 15 min). */
  reservationTtlMs?: number;
  /** $1 = N credits (default 1000; env QUANTMAIL_CREDITS_PER_USD). */
  creditsPerUsd?: number;
  /** Emit-only metering events. */
  onMeteringEvent?: (event: MeteringEvent) => void;
  /** Settle-miss alert hook. */
  onSettleMiss?: StreamMeteringOptions['onSettleMiss'];
  /**
   * disabled:true = permit-all NOOP (sirf dev/test). absent gate = DENY (fail closed).
   * NODE_ENV=production me disabled:true → registration THROW karta hai.
   */
  disabled?: boolean;
  /** Clock seam (tests). */
  clock?: () => Date;
}

export interface CheckUsageInput {
  kind?: MeteredAction['kind'];
  modelId?: string;
  modelClass?: string;
  /** Projected INPUT tokens (caller-measured, ceil(prompt.length/4)). */
  estTokens: number;
  /** D6 override: projected output tokens (default = tier cap). */
  estimateOutputTokens?: number;
  route?: string;
}

/** Per-request reservation context (onSend header hook ke liye). */
interface RequestUsageState {
  userId: string;
  estimatedCost: Credits;
}

function reqUserId(req: FastifyRequest): string {
  // SECURITY: userId SIRF JWT `sub` se (global requireAuth hook / inline guard —
  // ai-streaming.ts reqUserId pattern). Client-supplied userId kabhi trust nahi hota.
  const userId = (req as unknown as { auth?: { userId?: unknown } }).auth?.userId;
  if (typeof userId !== 'string' || userId.length === 0) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

/** Default PricingEngine build — D4: real ModelRouter rates; silent fallback FORBIDDEN. */
function buildDefaultPricing(opts: UsageGatePluginOptions): PricingEngine {
  const creditsPerUsd =
    opts.creditsPerUsd ??
    (Number(process.env[CREDITS_PER_USD_ENV]) || DEFAULT_CREDITS_PER_USD);
  if (opts.pricing) return opts.pricing;
  if (!opts.modelRouter) {
    // D4: bina real rates ke AI metering = silent mispricing risk → fail closed, loud.
    throw createAppError(
      'UsageGate requires modelRouter (real @quant/ai rates) or an explicit pricing engine — refusing silent fallback pricing',
      500,
      'PRICING_UNCONFIGURED',
    );
  }
  const unknownMarkup = Number(process.env[UNKNOWN_MODEL_MARKUP_ENV]) || 3;
  return new PricingEngine({
    creditsPerUsd,
    aiCost: createModelRouterCostEstimator(
      opts.modelRouter as unknown as Parameters<typeof createModelRouterCostEstimator>[0],
    ),
    rules: [
      // D4: unknown-model actions par explicit conservative ceiling (auditable markup).
      {
        actionKind: 'ai_inference',
        unit: 'per_1k_tokens',
        creditsPerUnit: unknownMarkup,
        modelClass: 'unknown',
        source: 'quant_ai_cost_tracker',
      },
    ],
  });
}

/**
 * Fastify plugin — `usageGateRoutes` / `registerUsageGate` (alias).
 *
 * Koi public route register NAHI karta (internal enforcement — NOTES.md §OpenAPI).
 * Decorates: `fastify.usageGate`, `fastify.usageGateMetering`, `request.checkUsage`.
 */
export async function usageGateRoutes(
  fastify: FastifyInstance,
  opts: UsageGatePluginOptions,
): Promise<void> {
  const nodeEnv = (process.env.NODE_ENV ?? 'development').toLowerCase();

  // --- disabled mode: explicit opt-in NOOP, dev/test only -------------------
  if (opts.disabled === true) {
    if (nodeEnv === 'production') {
      throw createAppError(
        'usageGate disabled:true is forbidden in production (fail-closed law)',
        500,
        'GATE_DISABLED_IN_PROD',
      );
    }
    const noopGate = {
      estimateCost: () => 0,
      getAvailableBalance: async () => Number.MAX_SAFE_INTEGER,
      getReservation: async () => undefined,
      checkAndReserve: async (_o: string, a: MeteredAction) => ({
        id: `noop-${Date.now()}`,
        ownerRef: _o,
        actionKey: a.actionKey,
        kind: a.kind,
        estimatedCost: 0,
        settled: false,
        createdAt: new Date(),
      }),
      settle: async (r: Reservation) => ({ ...r, settled: true, actualCost: 0 }),
    } as unknown as QuantmailUsageGate;
    fastify.decorate('usageGate', noopGate);
    fastify.decorate('usageGateMetering', {
      reserve: async () => ({ ok: true as const }),
      settle: async () => {},
    } satisfies StreamMetering);
    fastify.decorateRequest('checkUsage', null);
    fastify.addHook('onRequest', async (req) => {
      (req as unknown as { checkUsage: unknown }).checkUsage = async () => ({
        id: 'noop',
        estimatedCost: 0,
      });
    });
    return;
  }

  // --- build (or accept) the real gate --------------------------------------
  let gate: QuantmailUsageGate;
  let creditsPerUsd = DEFAULT_CREDITS_PER_USD;

  if (opts.gate) {
    gate = opts.gate;
  } else {
    // Fail-closed: na wallet na prisma → gate ban hi nahi sakta → DENY (loud).
    if (!opts.wallet && !opts.prisma) {
      throw createAppError(
        'UsageGate has no balance source (wallet/prisma) and no injected gate — refusing to run AI unmetered (fail-closed)',
        500,
        'GATE_UNCONFIGURED',
      );
    }
    const ttlMs = opts.reservationTtlMs ?? DEFAULT_RESERVATION_TTL_MS;
    const clock = opts.clock ?? (() => new Date());
    const pricing = buildDefaultPricing(opts);
    creditsPerUsd =
      opts.creditsPerUsd ?? (Number(process.env[CREDITS_PER_USD_ENV]) || DEFAULT_CREDITS_PER_USD);

    const store: OverageAwareStore = opts.prisma
      ? new PrismaReservationStore(opts.prisma, ttlMs, clock)
      : new TtlReservationStore(ttlMs);

    // Balance port: wallet-backed preferred (verified adapter); else prisma-direct.
    let balances: BalanceProviderPort;
    if (opts.wallet) {
      const wallet = opts.wallet;
      const normal = createWalletBalanceProvider({
        // createWalletBalanceProvider({ wallet, ... }) — wallet-balance-adapter.ts:71 verified.
        // Structural wallet type yahan staging-friendly hai; merge-time real CreditWallet.
        wallet: wallet as unknown as Parameters<typeof createWalletBalanceProvider>[0]['wallet'],
        reason: (r) => `settlement:${r.kind}`,
      });
      const overage = createWalletBalanceProvider({
        wallet: wallet as unknown as Parameters<typeof createWalletBalanceProvider>[0]['wallet'],
        reason: () => 'overage', // D3: overage portion ledger me mark
      });
      balances = new OverageAwareBalancePort(normal, overage, store);
    } else {
      // opts.prisma guaranteed yahan (upar fail-closed check).
      const prisma = opts.prisma as UsageGatePrisma;
      const direct = new PrismaBalancePort(prisma, (id) => store.isOverageHold(id));
      balances = direct;
    }

    const inner = new UsageGate({
      pricing,
      balances,
      reservations: store,
      // Anti-double-count (D7 note upar): gate ka slot permitAll; entitlement
      // exactly-once QuantmailUsageGate me evaluate hota hai.
      entitlements: permitAllEntitlements,
    });

    gate = new QuantmailUsageGate(inner, {
      store,
      entitlements: opts.entitlementPort,
      overagePort: opts.overagePort ?? overageDisabledPort,
      monthlyOverageUsed: opts.prisma
        ? createMonthlyOverageUsed(opts.prisma, clock)
        : undefined,
      sweepOnReserve: true,
    });
  }

  const metering = createStreamMetering(gate, {
    creditsPerUsd,
    onMeteringEvent: opts.onMeteringEvent,
    onSettleMiss: opts.onSettleMiss,
  });

  fastify.decorate('usageGate', gate);
  fastify.decorate('usageGateMetering', metering);
  // Per-tier/per-route adapters (tiers ke modelId/modelClass alag hain — plugin-level
  // adapter generic hai). forge: `fastify.createStreamMetering({ modelId, modelClass, route })`.
  fastify.decorate('createStreamMetering', (meteringOpts: StreamMeteringOptions = {}) =>
    createStreamMetering(gate, {
      creditsPerUsd,
      onMeteringEvent: opts.onMeteringEvent,
      onSettleMiss: opts.onSettleMiss,
      ...meteringOpts,
    }),
  );

  // --- request.checkUsage: JSON routes ke liye per-request reserve -------------
  fastify.decorateRequest('checkUsage', null);
  fastify.addHook('onRequest', async (req: FastifyRequest) => {
    (req as unknown as { checkUsage: (input: CheckUsageInput) => Promise<Reservation> }).checkUsage =
      async (input: CheckUsageInput): Promise<Reservation> => {
        const userId = reqUserId(req); // 401 agar JWT sub absent
        const modelClass = input.modelClass ?? 'balanced';
        const action: MeteredAction = {
          actionKey: `${globalThis.crypto.randomUUID()}:ai_inference`,
          kind: input.kind ?? 'ai_inference',
          ownerRef: userId,
          modelId: input.modelId,
          modelClass,
          projectedTokens: {
            input: Math.max(0, Math.floor(input.estTokens)),
            output: input.estimateOutputTokens ?? TIER_OUTPUT_CAP_TOKENS[modelClass] ?? TIER_OUTPUT_CAP_TOKENS.balanced,
          },
          metadata: { route: input.route ?? 'api', via: 'checkUsage' },
        };
        try {
          const reservation = await gate.checkAndReserve(userId, action);
          (req as unknown as { usageState?: RequestUsageState }).usageState = {
            userId,
            estimatedCost: reservation.estimatedCost,
          };
          return reservation;
        } catch (err) {
          const http = mapUsageErrorToHttp(err);
          throw createAppError(http.message, http.status, http.code);
        }
      };
  });

  // --- onSend: credits headers (sirf jab is request me reserve hua ho) ---------
  fastify.addHook('onSend', async (req: FastifyRequest, reply: FastifyReply) => {
    const state = (req as unknown as { usageState?: RequestUsageState }).usageState;
    if (!state) return;
    try {
      const remaining = await gate.getAvailableBalance(state.userId);
      reply.header(HDR_CREDITS_REMAINING, String(remaining));
      reply.header(HDR_CREDITS_RESERVED, String(state.estimatedCost));
    } catch {
      /* header best-effort — response ko kabhi break nahi karta */
    }
  });
}

/** Alias — dono naam task me mange gaye hain. */
export const registerUsageGate = usageGateRoutes;

// ---------------------------------------------------------------------------
// Fastify type augmentation (merge-time; staging me structural any use hota hai)
// ---------------------------------------------------------------------------

declare module 'fastify' {
  interface FastifyInstance {
    usageGate: QuantmailUsageGate;
    usageGateMetering: StreamMetering;
    createStreamMetering: (opts?: StreamMeteringOptions) => StreamMetering;
  }
  interface FastifyRequest {
    checkUsage: (input: CheckUsageInput) => Promise<Reservation>;
  }
}
