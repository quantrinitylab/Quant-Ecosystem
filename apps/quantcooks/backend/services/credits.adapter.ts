// ============================================================================
// QuantCooks CP-2 — the credits adapter: @quant/credits wired into
// QuantCooks (CP-1 manifest spec §6.2 + §6.5).
//
// Two ports live here, sharing the wallet-construction idiom but NOT code
// paths (§6.5 point 5 — the orchestrator predates the registry and keeps
// its own port; do not refactor one onto the other):
//
//  1. buildCreditsExecutionPort — the registry's CreditsExecutionPort
//     (§6.2): reserve → settle-or-release over UsageGate +
//     createWalletBalanceProvider + CreditWallet. The registry calls it
//     only for credit-bearing invokes; get_credit_balance /
//     list_credit_history read through it (history reads the ledger via
//     prisma directly, §6.2's mapping, gated on this port existing).
//
//  2. buildCreditsPort — the auto-edit orchestrator's debit-only
//     CreditsPort (§6.5's exact change): a successful run debits the
//     rate-table price once, keyed by the orchestrator's own
//     `auto-edit:{runId}` idempotency key.
//
// CONFIGURED means the ledger is reachable from this process: the prisma
// client handed in exposes a callable creditLedgerEntry delegate. When
// it does not (no DB in the environment, a stub client), both builders
// return null and every surface keeps its honest CP-1 behaviour —
// CREDITS_NOT_CONFIGURED refusals, unmetered runs recording
// creditsCharged: 0. Nothing here fabricates a balance: every number
// returned is derived by CreditWallet from the append-only ledger.
//
// RECONCILIATION (spec §6.2 vs landed CP-1 code): the spec names the
// reservation key 'quantcooks:job:{jobId}'; the landed registry passes
// an invoke-scoped id (`invoke:{auditId}`) as the port's scope argument.
// The adapter treats that argument as an opaque scope id and prefixes it
// per the spec — the key is stable across reserve/settle/release for one
// invoke, which is the invariant the gate's idempotency needs.
// ============================================================================

import {
  CreditWallet,
  UsageGate,
  InMemoryReservationStore,
  PricingEngine,
  createWalletBalanceProvider,
  type MeteredAction,
  type Reservation,
} from '@quant/credits';
import { createAppError } from '@quant/server-core';
import type { CreditsPort } from './auto-edit-orchestrator.service';
import type { CreditsExecutionPort } from '../tools/pricing';

/**
 * The ledger is "configured" iff the client's creditLedgerEntry delegate
 * is really callable. A shape check, not a presence check: the test
 * environment's @prisma/client stub is a Proxy that answers every
 * property with a function — its "delegate" has no findMany/create of
 * its own, so it correctly reads as NOT configured here.
 */
function hasLedgerDelegate(prisma: unknown): boolean {
  if (!prisma || typeof prisma !== 'object') return false;
  const delegate = (prisma as Record<string, unknown>)['creditLedgerEntry'];
  if (!delegate || (typeof delegate !== 'object' && typeof delegate !== 'function')) {
    return false;
  }
  const d = delegate as Record<string, unknown>;
  return (
    typeof d['findMany'] === 'function' &&
    typeof d['create'] === 'function' &&
    typeof d['findFirst'] === 'function'
  );
}

/**
 * PricingEngine prices by ActionKind, and its kind set has NO QuantCooks
 * driver (spec K5) — QuantCooks prices come from its own rate table and
 * are fixed by the quote BEFORE the port is called (§6.1/§6.3). This
 * engine therefore returns the quoted amount the adapter carries on the
 * action, verbatim (whole credits; the adapter validates integrality
 * before reserving). The UsageGate still owns the mechanics that matter
 * — fail-closed availability checks and idempotent reserve/settle —
 * while the price itself stays CP-1's quote, never a second table.
 */
class QuotedAmountPricingEngine extends PricingEngine {
  override estimateCost(action: MeteredAction): number {
    const quoted = action.metadata?.['quotedCredits'];
    return typeof quoted === 'number' && Number.isFinite(quoted) && quoted > 0
      ? Math.ceil(quoted)
      : 0;
  }
}

/** §6.2's reservation key shape, over the registry's opaque scope id. */
const reservationKeyFor = (scopeId: string): string => `quantcooks:job:${scopeId}`;

/**
 * Build the registry's credits port over @quant/credits, or null when
 * the ledger is not configured for this process (see header).
 *
 * Semantics (spec §6.1):
 *  - reserve holds the QUOTED amount; insufficient available balance →
 *    402 OUT_OF_CREDITS from the gate and NO hold is recorded (the
 *    registry creates no job for a refused invoke).
 *  - settle charges min(actual, quote) — never more than the quote; the
 *    wallet debit is keyed by the reservation's actionKey, so a replayed
 *    settle appends nothing.
 *  - release is settle-at-0: the hold closes, no debit exists to refund
 *    (the job display calls the released amount "refunded", §6.2).
 *  - getBalance returns the wallet's derived buckets plus `held`, the
 *    sum of this process's open reservations (the gate's store is
 *    in-memory in staging — the same staging note as CP-1's QuoteStore,
 *    §6.2; balances themselves are always ledger-derived).
 */
export function buildCreditsExecutionPort(prisma: unknown): CreditsExecutionPort | null {
  if (!hasLedgerDelegate(prisma)) return null;

  const wallet = new CreditWallet(prisma as never);
  const reservationStore = new InMemoryReservationStore();
  const gate = new UsageGate({
    pricing: new QuotedAmountPricingEngine(),
    balances: createWalletBalanceProvider({
      wallet,
      reason: (r) => `quantcooks tool invoke (${r.actionKey})`,
    }),
    reservations: reservationStore,
  });

  // scopeId → the reservation record, so settle/release (which receive
  // only the scope id) can find the owner's stored hold.
  const open = new Map<string, { userId: string; reservation: Reservation }>();

  return {
    async reserve(userId: string, scopeId: string, credits: number) {
      if (!Number.isInteger(credits) || credits < 0) {
        throw createAppError(
          `Credit amounts are whole credits only (got ${credits}) — see CP-1 spec §6.4`,
          400,
          'INVALID_AMOUNT',
        );
      }
      const reservation = await gate.checkAndReserve(userId, {
        actionKey: reservationKeyFor(scopeId),
        // The kind is a label on the reservation record only — the price
        // comes from the quote (QuotedAmountPricingEngine), not the kind.
        kind: 'agent_org_run',
        metadata: { quotedCredits: credits, scopeId },
      });
      open.set(scopeId, { userId, reservation });
      return { reservationKey: reservation.actionKey };
    },

    async settle(scopeId: string, actualCredits: number) {
      const entry = open.get(scopeId);
      if (!entry) {
        throw createAppError(
          `No credit reservation exists for scope ${scopeId}`,
          404,
          'RESERVATION_NOT_FOUND',
        );
      }
      // The cap (§6.1): an overrun beyond the quote is absorbed, never
      // surprise-charged. The gate's own settle is idempotent.
      const capped = Math.min(
        Math.max(0, Number.isFinite(actualCredits) ? actualCredits : 0),
        entry.reservation.estimatedCost,
      );
      await gate.settle(entry.reservation, capped);
    },

    async release(scopeId: string) {
      // Cleanup path (the registry calls this from its error handler):
      // settle at 0 when a hold exists; a missing hold is already
      // released, so this never throws and masks the real error.
      const entry = open.get(scopeId);
      if (!entry) return;
      await gate.settle(entry.reservation, 0);
    },

    async getBalance(userId: string) {
      // The caller IS the owner (the tool layer invokes as the caller);
      // the wallet's owner-only authz permits exactly that read.
      const balance = await wallet.getBalance({ principalId: userId }, { ownerId: userId });
      const held = (await reservationStore.listOpen(userId)).reduce(
        (sum, r) => sum + r.estimatedCost,
        0,
      );
      return { ...balance, held };
    },
  };
}

/**
 * §6.5's adapter: the auto-edit orchestrator's CreditsPort over the same
 * wallet. Returns null when the ledger is not configured — the caller
 * then leaves the orchestrator unmetered, which the run record shows
 * honestly as creditsCharged: 0. OUT_OF_CREDITS propagates as a thrown
 * AppError → the orchestrator's meter-step catch fails the run with
 * creditsCharged: 0 — an unfunded auto-edit does not publish.
 */
export function buildCreditsPort(prisma: unknown): CreditsPort | null {
  if (!hasLedgerDelegate(prisma)) return null;
  const wallet = new CreditWallet(prisma as never);
  return {
    async debit(userId: string, credits: number, idempotencyKey: string): Promise<void> {
      await wallet.debit({ ownerId: userId }, credits, idempotencyKey, {
        reason: 'quantcooks auto-edit run',
      });
    },
  };
}
