// ============================================================================
// Company OS module — Org budget reservation port (credit-backed) (Phase 7)
// quantmail-superhub · Task 30.1 (Requirements 21.1, 21.2, 21.3)
// ============================================================================
//
// PURPOSE
//   Denominate the Company OS org budget in REAL credits backed by the CEO's
//   wallet (design §"Requirement 21"). When an `AgentOrg` is provisioned the
//   orchestrator RESERVES the org `budgetCap` in credits from the CEO's
//   `CreditWallet`; if the CEO's reservable balance is below the requested cap
//   the reservation FAILS CLOSED and provisioning is rejected (Req 21.1). Once
//   reserved, the org can never spend more credits than the CEO actually funded,
//   so `org.costSpent <= budgetCap` is backed by money, not just clamped
//   in-memory (Req 21.2).
//
// MODEL (why a debit, not a bespoke "hold")
//   The `CreditWallet` exposes no first-class "reserve/hold" primitive beyond
//   the per-action UsageGate reservation flow. For an ORG-level budget the
//   cleanest model consistent with the existing wallet API is to DEBIT the CEO
//   wallet by `budgetCap` at provisioning, keyed idempotently by the org id
//   (`org-budget:{orgId}`). That single debit:
//     • fails closed (the wallet appends nothing and throws OUT_OF_CREDITS when
//       the CEO balance < cap) — exactly Req 21.1;
//     • caps org spend at what was funded — the org's budget is literally the
//       credits moved out of the CEO wallet (Req 21.2);
//     • is idempotent by `actionKey`, so re-provisioning the SAME org never
//       double-reserves (the wallet replays the prior debit).
//   The wallet's append-only ledger entry (actionKey `org-budget:{orgId}`) is
//   the SOURCE OF TRUTH for the reservation, so no additive Prisma column is
//   needed on `AgentOrg`.
//
// MODULE BOUNDARY
//   The port INTERFACE lives in the company module; the company orchestrator
//   depends only on this injectable seam. The real adapter consumes Billing
//   ONLY via the billing module barrel (`../../billing`) — it never reaches into
//   `modules/billing/services/*`, never imports the mail domain, and never
//   touches QuantChat.

import { createAppError } from '@quant/server-core';
import type { CreditWallet, OwnerRef } from '../../billing';

// ---------------------------------------------------------------------------
// Port contract
// ---------------------------------------------------------------------------

/** Input to {@link OrgBudgetReservationPort.reserve}. */
export interface OrgBudgetReservationInput {
  /** The org whose budget is being reserved (the idempotency key). */
  orgId: string;
  /** Whole-credit org budget ceiling to reserve from the CEO wallet. */
  budgetCap: number;
  /** The CEO whose wallet funds the reservation. */
  ceoUserId: string;
  /** The tenant the org/wallet belongs to (enables tenant-scoped reads). */
  tenantId: string;
}

/** The outcome of a successful (or replayed) org-budget reservation. */
export interface OrgBudgetReservation {
  orgId: string;
  /** Whole credits actually reserved (debited) from the CEO wallet. */
  reserved: number;
  /**
   * True when this call REPLAYED a prior reservation for the same org (no new
   * credits moved); false when it appended a fresh reservation.
   */
  replayed: boolean;
  /** The wallet ledger entry ids backing this reservation (for audit). */
  ledgerEntryIds: string[];
}

/**
 * Reserves (and optionally releases) an org's credit budget from the CEO
 * wallet. Injected into the {@link CompanyOrchestrator} so the company module
 * never imports a billing service directly.
 */
export interface OrgBudgetReservationPort {
  /**
   * Reserve `budgetCap` credits from the CEO wallet for `orgId`, keyed
   * idempotently by the org id.
   *
   * @throws 402 INSUFFICIENT_ORG_BUDGET when the CEO's reservable balance is
   *         below the requested cap (FAIL CLOSED — nothing is reserved).
   */
  reserve(input: OrgBudgetReservationInput): Promise<OrgBudgetReservation>;
  /** Optionally release a previously reserved org budget (best-effort). */
  release?(orgId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Real adapter — backed by the billing CreditWallet (via the module barrel)
// ---------------------------------------------------------------------------

export interface CreditWalletOrgBudgetReservationOptions {
  /** The CEO-owned wallet the org budget is reserved from. */
  wallet: CreditWallet;
  /** Wallet owner type for the CEO ref (defaults to "user"). */
  ownerType?: 'user' | 'org';
}

/** The deterministic, idempotent wallet action key for an org-budget reservation. */
export function orgBudgetActionKey(orgId: string): string {
  return `org-budget:${orgId}`;
}

/** True for the wallet's fail-closed insufficient-funds signal. */
function isOutOfCredits(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'OUT_OF_CREDITS'
  );
}

/**
 * Build an {@link OrgBudgetReservationPort} backed by the real
 * {@link CreditWallet}. The reservation is a single idempotent debit of the
 * (rounded-up) `budgetCap` from the CEO wallet, keyed by `org-budget:{orgId}`:
 *
 * ```ts
 * import { CreditWallet } from '../../billing';
 * const reservation = createCreditWalletOrgBudgetReservation({ wallet });
 * const orchestrator = new CompanyOrchestrator(prisma, { orgBudgetReservation: reservation });
 * ```
 *
 * Because the wallet's `debit` is idempotent by `actionKey` and checks the
 * idempotency replay BEFORE the balance precondition, re-running `reserve` for
 * the same org never double-reserves and never spuriously fails closed.
 */
export function createCreditWalletOrgBudgetReservation(
  options: CreditWalletOrgBudgetReservationOptions,
): OrgBudgetReservationPort {
  const { wallet } = options;
  const ownerType = options.ownerType ?? 'user';

  return {
    async reserve(input: OrgBudgetReservationInput): Promise<OrgBudgetReservation> {
      const orgId = typeof input?.orgId === 'string' ? input.orgId.trim() : '';
      if (orgId.length === 0) {
        throw createAppError('An org id is required', 400, 'ORG_ID_REQUIRED');
      }
      if (typeof input.ceoUserId !== 'string' || input.ceoUserId.trim().length === 0) {
        throw createAppError('A CEO user id is required', 400, 'CEO_REQUIRED');
      }
      if (!Number.isFinite(input.budgetCap) || input.budgetCap < 0) {
        throw createAppError(
          'budgetCap must be a non-negative number',
          400,
          'INVALID_BUDGET_CAP',
        );
      }

      // Reserve WHOLE credits >= the requested cap so org spend (which is itself
      // bounded by the cap) is always fully credit-backed.
      const amount = Math.ceil(input.budgetCap);

      // A zero cap reserves nothing (the wallet rejects a zero debit) — a
      // zero-budget org is trivially within its (zero) funded ceiling.
      if (amount <= 0) {
        return { orgId, reserved: 0, replayed: false, ledgerEntryIds: [] };
      }

      const ownerRef: OwnerRef = {
        ownerId: input.ceoUserId,
        ownerType,
        tenantId: input.tenantId,
      };

      try {
        // FAIL CLOSED (Req 21.1) + IDEMPOTENT (re-provisioning the same org
        // replays the prior debit, never double-reserving). The wallet appends
        // nothing when the CEO balance < amount.
        const result = await wallet.debit(ownerRef, amount, orgBudgetActionKey(orgId), {
          sourceRef: orgId,
          reason: 'org budget reservation',
        });
        return {
          orgId,
          reserved: result.total,
          replayed: result.replayed,
          ledgerEntryIds: result.entries.map((e) => e.id),
        };
      } catch (err) {
        // Map the wallet's generic out-of-credits signal to a budget-specific
        // error so provisioning rejects with a clear reason (Req 21.1).
        if (isOutOfCredits(err)) {
          throw createAppError(
            `The CEO's reservable balance is below the requested org budget cap (${amount})`,
            402,
            'INSUFFICIENT_ORG_BUDGET',
          );
        }
        throw err;
      }
    },
  };
}
