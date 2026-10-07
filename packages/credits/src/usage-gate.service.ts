// ============================================================================
// Billing module — CreditMeter / UsageGate (the single metered-action choke point)
// quantmail-superhub · Task 13.1 (Requirements 18.1, 18.5)
// ============================================================================
//
// PURPOSE
//   Implements the design's `CreditMeter` (a.k.a. `UsageGate`) — the ONE choke
//   point every metered action passes through (design §"INTERFACE CreditMeter"):
//
//       FUNCTION estimateCost(action) RETURNS Credits
//       FUNCTION checkAndReserve(ownerRef, action) RETURNS Reservation
//         PRECONDITION:  entitlements permit action.kind        (else: upgrade)
//         PRECONDITION:  balance.total >= estimateCost(action)  (else: out of credits)
//         POSTCONDITION: a hold/debit is recorded keyed by action.actionKey
//                        (atomic, idempotent)
//         INVARIANT:     NO metered action proceeds without a successful
//                        reservation (FAIL CLOSED)
//       PROCEDURE settle(reservation, actualCost)
//         POSTCONDITION: reconcile estimate vs actual (refund/charge delta)
//         INVARIANT:     settling the same reservation twice is a no-op
//
//   This is the EARLY hook (design metering-placement note): the choke point
//   and reserve→settle pattern exist now so usage is measurable from the start,
//   but the authoritative `CreditWallet` + append-only ledger, daily resets,
//   and plans land in Phase 7 (tasks 25–31). Two seams keep that swap clean:
//     • {@link BalanceProviderPort} — reads (and, on settle, debits) the backing
//       balance. The default is an in-memory provider; Phase 7 injects the real
//       `CreditWallet` (`balance == sum(ledger)`).
//     • {@link ReservationStore}   — records holds keyed by `actionKey` for
//       idempotency. The default is in-memory; Phase 7 persists it.

import { createAppError } from './errors';
import {
  PricingEngine,
  type Credits,
  type MeteredAction,
  type ActionKind,
} from './pricing-engine.service';

// ---------------------------------------------------------------------------
// Reservation
// ---------------------------------------------------------------------------

/** A recorded hold against an owner's balance for a single metered action. */
export interface Reservation {
  /** Stable reservation id. */
  id: string;
  /** Owner the hold is billed to. */
  ownerRef: string;
  /** Idempotency key (equals the originating `action.actionKey`). */
  actionKey: string;
  /** The cost driver that was reserved. */
  kind: ActionKind;
  /** Credits estimated + held at reserve time. */
  estimatedCost: Credits;
  /** True once {@link CreditMeter.settle} has reconciled this reservation. */
  settled: boolean;
  /** Final, measured credit cost (present only after settlement). */
  actualCost?: Credits;
  createdAt: Date;
  settledAt?: Date;
}

// ---------------------------------------------------------------------------
// Seams
// ---------------------------------------------------------------------------

/**
 * Reads the backing credit balance and applies settled debits. Until Phase 7
 * this is an in-memory seam; Phase 7 swaps in the real `CreditWallet` where
 * `getBalance` derives `sum(ledger)` and `recordSettlement` appends a ledger
 * debit. The UsageGate enforces fail-closed using whatever balance this reports
 * minus the credits currently held by open reservations.
 */
export interface BalanceProviderPort {
  /** Total credits currently available to the owner (before open holds). */
  getBalance(ownerRef: string): number | Promise<number>;
  /** Apply the final, settled debit. Optional (in-memory default deducts). */
  recordSettlement?(
    ownerRef: string,
    actualCost: Credits,
    reservation: Reservation,
  ): void | Promise<void>;
}

/** Stores reservations keyed by `(ownerRef, actionKey)` for idempotent debits. */
export interface ReservationStore {
  get(
    ownerRef: string,
    actionKey: string,
  ): Reservation | undefined | Promise<Reservation | undefined>;
  put(reservation: Reservation): void | Promise<void>;
  update(reservation: Reservation): void | Promise<void>;
  /** All as-yet-unsettled reservations for an owner (their held credits). */
  listOpen(ownerRef: string): Reservation[] | Promise<Reservation[]>;
}

/**
 * Decides whether an owner's plan permits a cost driver (design: the gate
 * consults `PlanService.entitlements`). Phase 7 injects the real `PlanService`;
 * the default permits everything so the early hook never blocks development.
 */
export interface EntitlementPort {
  permits(ownerRef: string, kind: ActionKind): boolean | Promise<boolean>;
}

/** Default entitlement policy: permit every cost driver (Phase 7 tightens this). */
export const permitAllEntitlements: EntitlementPort = {
  permits() {
    return true;
  },
};

// ---------------------------------------------------------------------------
// In-memory defaults (Phase-7 swaps these for the real wallet/ledger)
// ---------------------------------------------------------------------------

export interface InMemoryBalanceProviderOptions {
  /** Balance returned for owners with no explicit entry. Defaults to 0 (fail closed). */
  defaultBalance?: number;
  /** Seed balances per owner. */
  initial?: Record<string, number>;
}

/**
 * A trivial in-memory balance provider used as the default backing store for
 * the early metering hook. `recordSettlement` deducts the settled credits so
 * repeated metering draws the balance down. NOT the authoritative wallet — the
 * Phase-7 `CreditWallet` (balance == sum(ledger)) replaces it.
 */
export class InMemoryBalanceProvider implements BalanceProviderPort {
  private readonly balances = new Map<string, number>();
  private readonly defaultBalance: number;

  constructor(options: InMemoryBalanceProviderOptions = {}) {
    this.defaultBalance = options.defaultBalance ?? 0;
    for (const [owner, amount] of Object.entries(options.initial ?? {})) {
      this.balances.set(owner, amount);
    }
  }

  getBalance(ownerRef: string): number {
    return this.balances.get(ownerRef) ?? this.defaultBalance;
  }

  /** Seed or overwrite an owner's balance (test/dev convenience). */
  setBalance(ownerRef: string, amount: number): void {
    this.balances.set(ownerRef, Math.max(0, amount));
  }

  /** Grant credits to an owner (test/dev convenience; Phase 7 uses the ledger). */
  credit(ownerRef: string, amount: number): void {
    this.balances.set(ownerRef, this.getBalance(ownerRef) + Math.max(0, amount));
  }

  recordSettlement(ownerRef: string, actualCost: Credits): void {
    const next = this.getBalance(ownerRef) - Math.max(0, actualCost);
    this.balances.set(ownerRef, Math.max(0, next));
  }
}

/** In-memory {@link ReservationStore} keyed by `(ownerRef, actionKey)`. */
export class InMemoryReservationStore implements ReservationStore {
  private readonly byKey = new Map<string, Reservation>();

  private key(ownerRef: string, actionKey: string): string {
    return `${ownerRef}::${actionKey}`;
  }

  get(ownerRef: string, actionKey: string): Reservation | undefined {
    return this.byKey.get(this.key(ownerRef, actionKey));
  }

  put(reservation: Reservation): void {
    this.byKey.set(this.key(reservation.ownerRef, reservation.actionKey), reservation);
  }

  update(reservation: Reservation): void {
    this.byKey.set(this.key(reservation.ownerRef, reservation.actionKey), reservation);
  }

  listOpen(ownerRef: string): Reservation[] {
    const open: Reservation[] = [];
    for (const r of this.byKey.values()) {
      if (r.ownerRef === ownerRef && !r.settled) open.push(r);
    }
    return open;
  }
}

// ---------------------------------------------------------------------------
// CreditMeter / UsageGate
// ---------------------------------------------------------------------------

export interface UsageGateOptions {
  /** The pricing engine. Defaults to a {@link PricingEngine} with default rules. */
  pricing?: PricingEngine;
  /** Backing balance source. Defaults to a zero-balance {@link InMemoryBalanceProvider}. */
  balances?: BalanceProviderPort;
  /** Reservation record store. Defaults to {@link InMemoryReservationStore}. */
  reservations?: ReservationStore;
  /** Plan-entitlement check. Defaults to {@link permitAllEntitlements}. */
  entitlements?: EntitlementPort;
  /** Reservation-id generator seam (overridable for deterministic tests). */
  generateId?: () => string;
}

/**
 * The single metered-action choke point. Implements the design's `CreditMeter`
 * interface with a reserve-then-settle flow:
 *
 *   1. {@link estimateCost} prices the action via the {@link PricingEngine}.
 *   2. {@link checkAndReserve} verifies entitlements, then checks the available
 *      balance (`getBalance − openHolds`) against the estimate and records a
 *      hold keyed by `actionKey`. It FAILS CLOSED — an action whose cost exceeds
 *      the available balance is rejected and no hold is recorded.
 *   3. {@link settle} reconciles the hold against the measured actual cost.
 *
 * Both `checkAndReserve` and `settle` are idempotent by `actionKey`, so retries
 * never double-charge.
 */
export class UsageGate {
  private readonly pricing: PricingEngine;
  private readonly balances: BalanceProviderPort;
  private readonly reservations: ReservationStore;
  private readonly entitlements: EntitlementPort;
  private readonly generateId: () => string;

  constructor(options: UsageGateOptions = {}) {
    this.pricing = options.pricing ?? new PricingEngine();
    this.balances = options.balances ?? new InMemoryBalanceProvider();
    this.reservations = options.reservations ?? new InMemoryReservationStore();
    this.entitlements = options.entitlements ?? permitAllEntitlements;
    this.generateId = options.generateId ?? (() => globalThis.crypto.randomUUID());
  }

  /** Map a cost driver to a credit cost (design `CreditMeter.estimateCost`). */
  estimateCost(action: MeteredAction): Credits {
    return this.pricing.estimateCost(action);
  }

  /**
   * Total credits available to spend right now: the backing balance minus the
   * credits already held by this owner's open (unsettled) reservations.
   */
  async getAvailableBalance(ownerRef: string): Promise<Credits> {
    const [balance, open] = await Promise.all([
      Promise.resolve(this.balances.getBalance(ownerRef)),
      Promise.resolve(this.reservations.listOpen(ownerRef)),
    ]);
    const held = open.reduce((sum, r) => sum + r.estimatedCost, 0);
    return Math.max(0, balance - held);
  }

  /** Look up an existing reservation by its idempotency key. */
  getReservation(ownerRef: string, actionKey: string): Promise<Reservation | undefined> {
    return Promise.resolve(this.reservations.get(ownerRef, actionKey));
  }

  /**
   * Check entitlements + reserve credits BEFORE the action runs.
   *
   * Idempotent: replaying the same `actionKey` returns the existing reservation
   * without recording a second hold. Fails closed: rejects with
   * `UPGRADE_REQUIRED` when the plan does not permit the driver, or
   * `OUT_OF_CREDITS` when the available balance cannot fund the estimate.
   *
   * @throws 402 UPGRADE_REQUIRED  entitlements do not permit `action.kind`.
   * @throws 402 OUT_OF_CREDITS    available balance < estimated cost.
   */
  async checkAndReserve(ownerRef: string, action: MeteredAction): Promise<Reservation> {
    // Idempotency: a prior reservation for this key is a no-op (return as-is).
    const existing = await this.reservations.get(ownerRef, action.actionKey);
    if (existing) return existing;

    // PRECONDITION: the plan must permit this cost driver.
    const permitted = await this.entitlements.permits(ownerRef, action.kind);
    if (!permitted) {
      throw createAppError(`Your plan does not permit '${action.kind}'`, 402, 'UPGRADE_REQUIRED');
    }

    // PRECONDITION (FAIL CLOSED): available balance must cover the estimate.
    const estimate = this.estimateCost(action);
    const available = await this.getAvailableBalance(ownerRef);
    if (available < estimate) {
      throw createAppError(
        `Insufficient credits: '${action.kind}' needs ${estimate} but only ${available} available`,
        402,
        'OUT_OF_CREDITS',
      );
    }

    // POSTCONDITION: record the hold keyed by actionKey (idempotent).
    const reservation: Reservation = {
      id: this.generateId(),
      ownerRef,
      actionKey: action.actionKey,
      kind: action.kind,
      estimatedCost: estimate,
      settled: false,
      createdAt: new Date(),
    };
    await this.reservations.put(reservation);
    return reservation;
  }

  /**
   * Reconcile a reservation against the measured actual cost after the action
   * ran. Idempotent: settling an already-settled reservation is a no-op and
   * returns the existing settled record. The settled debit is applied to the
   * backing balance via {@link BalanceProviderPort.recordSettlement}.
   *
   * @throws 404 RESERVATION_NOT_FOUND  no reservation exists for the key.
   */
  async settle(reservation: Reservation, actualCost: Credits): Promise<Reservation> {
    // INVARIANT (Req 18.5, FAIL CLOSED): a reservation must have been RECORDED
    // by checkAndReserve before it can be settled. We do not trust the passed
    // object — settlement reconciles only an actually-stored reservation, so a
    // metered action can never settle (and thus debit) without a prior hold.
    const current = await this.reservations.get(reservation.ownerRef, reservation.actionKey);

    if (!current || current.id == null) {
      throw createAppError('Reservation not found', 404, 'RESERVATION_NOT_FOUND');
    }

    // INVARIANT: settling twice is a no-op.
    if (current.settled) return current;

    const finalCost = Math.max(0, Math.ceil(Number.isFinite(actualCost) ? actualCost : 0));
    const settled: Reservation = {
      ...current,
      settled: true,
      actualCost: finalCost,
      settledAt: new Date(),
    };
    await this.reservations.update(settled);
    await this.balances.recordSettlement?.(settled.ownerRef, finalCost, settled);
    return settled;
  }
}
