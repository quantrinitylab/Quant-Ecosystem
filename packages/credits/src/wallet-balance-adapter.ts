// ============================================================================
// Billing module — wire the UsageGate to the real CreditWallet
// quantmail-superhub · Task 27.1 (Requirements 18.1, 18.2, 18.6, 18.7)
// ============================================================================
//
// PURPOSE
//   The early metering hook (task 13.1) backed the UsageGate's
//   {@link BalanceProviderPort} with an in-memory provider. Phase 7 swaps in the
//   authoritative {@link CreditWallet} (balance == sum(ledger)). This adapter is
//   that swap:
//
//     • getBalance(ownerRef)        -> wallet.getBalance(...).total
//     • recordSettlement(...)       -> wallet.debit(..., reservation.actionKey)
//
//   Keying the settling debit by the RESERVATION's `actionKey` makes settlement
//   idempotent (Req 18.6): the wallet's `debit` is a no-op replay for a key it
//   has already consumed, so a retried/duplicated settlement never double-charges.
//   The debit also consumes buckets in the fixed order DAILY -> MONTHLY ->
//   PURCHASED (Req 18.2/18.7) and fails closed (never negative). Because the
//   UsageGate only ever calls `recordSettlement` AFTER a successful
//   `checkAndReserve`, no metered action can debit the wallet without a prior
//   reservation (Req 18.3/18.5).
//
// MODULE BOUNDARY
//   Infra module: depends only on its own billing services + the shared
//   ownership-authz helper. No mail-domain / QuantChat imports.

import type { BalanceProviderPort, Reservation } from './usage-gate.service';
import type { CreditWallet, OwnerRef } from './credit-wallet.service';
import type { OwnershipPrincipal } from './ownership-authz';
import type { Credits } from './pricing-engine.service';

export interface WalletBalanceProviderOptions {
  /** The authoritative wallet the gate reads balances from and debits on settle. */
  wallet: CreditWallet;
  /**
   * Map the gate's string `ownerRef` to the wallet's {@link OwnerRef}. Defaults
   * to treating the string as a user id (`{ ownerId: ref }`). Override to carry
   * the tenant/owner-type when the gate's owner key is richer.
   */
  resolveOwner?(ownerRef: string): OwnerRef;
  /**
   * Resolve the principal authorized to read the owner's wallet balance.
   * Defaults to the owner reading their OWN wallet (`{ principalId: ref }`),
   * which the owner-only authz filter permits — the gate meters on behalf of
   * the owner whose action it is gating.
   */
  resolveCaller?(ownerRef: string): OwnershipPrincipal;
  /** Build the audit reason recorded on the settling debit. */
  reason?(reservation: Reservation): string;
}

function defaultOwner(ownerRef: string): OwnerRef {
  return { ownerId: ownerRef };
}

function defaultCaller(ownerRef: string): OwnershipPrincipal {
  return { principalId: ownerRef };
}

/**
 * Build a {@link BalanceProviderPort} backed by the real {@link CreditWallet}.
 * Inject the returned port as the UsageGate's `balances` option so the early
 * metering hook reads/debits the authoritative ledger:
 *
 * ```ts
 * const balances = createWalletBalanceProvider({ wallet });
 * const gate = new UsageGate({ balances, pricing, entitlements });
 * ```
 */
export function createWalletBalanceProvider(
  options: WalletBalanceProviderOptions,
): BalanceProviderPort {
  const resolveOwner = options.resolveOwner ?? defaultOwner;
  const resolveCaller = options.resolveCaller ?? defaultCaller;

  return {
    async getBalance(ownerRef: string): Promise<number> {
      const balance = await options.wallet.getBalance(
        resolveCaller(ownerRef),
        resolveOwner(ownerRef),
      );
      return balance.total;
    },

    async recordSettlement(
      ownerRef: string,
      actualCost: Credits,
      reservation: Reservation,
    ): Promise<void> {
      // A zero (or rounded-down-to-zero) settlement debits nothing.
      const cost = Math.max(0, Math.floor(Number.isFinite(actualCost) ? actualCost : 0));
      if (cost <= 0) return;

      // Key the debit by the RESERVATION's actionKey so a replayed settlement is
      // a no-op in the wallet (Req 18.6); consume DAILY -> MONTHLY -> PURCHASED
      // (Req 18.2/18.7); fail closed if the wallet cannot fund it.
      await options.wallet.debit(resolveOwner(ownerRef), cost, reservation.actionKey, {
        sourceRef: reservation.id,
        reason: options.reason?.(reservation) ?? `settlement:${reservation.kind}`,
      });
    },
  };
}
