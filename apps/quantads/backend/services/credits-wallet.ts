// ============================================================================
// QuantAds — credits-backed wallet facade (durable @quant/credits ledger)
// ============================================================================
//
// Replaces the ephemeral in-memory `CoinWallet` (a per-process `Map`, wiped on
// every restart) for all QuantAds money movement. Every coin operation now
// lands on the durable, append-only `@quant/credits` ledger:
//
//   • grantOnce(userId, amount, kind, key)  — idempotent credit (buy / earn).
//   • spend(userId, amount, spendId)         — idempotent debit (boost / store).
//   • transfer(from, to, amount, transferId) — atomic peer move (gift / tip).
//   • getBalance(userId)                      — total derived from the ledger.
//   • hasEntry(userId, sourceRef)             — provenance check for once-a-day
//     style guards (daily login / referral) that the old service tracked in a
//     separate in-memory map.
//
// Coins map 1:1 to whole credits. Authz: QuantAds economy endpoints attribute
// to the userId in the request (there is no cross-user access here), so reads
// use a self-principal — the ledger's owner-only authz filter then admits the
// owner reading their own wallet and nothing else.
//
// This is durable and idempotent by construction; there is NO second money
// store, so there is no dual-ledger. The prior CoinWallet held no persisted
// balance, so nothing is lost in the switch (no backfill is required).

import {
  CreditWallet,
  CreditTransferService,
  type CreditKind,
  type OwnerRef,
  type OwnershipPrincipal,
  type TransferResult,
  type SpendResult,
} from '@quant/credits';

export class QuantAdsCreditsWallet {
  private readonly wallet: CreditWallet;
  private readonly transfers: CreditTransferService;

  constructor(prisma: unknown) {
    // The real PrismaClient satisfies both services' structural needs; the
    // quantads narrow PrismaClient type does not model creditLedgerEntry, so we
    // pass it through the ledger services (which own their own prisma typing).
    this.wallet = new CreditWallet(prisma as never);
    this.transfers = new CreditTransferService(prisma as never);
  }

  private static owner(userId: string): OwnerRef {
    return { ownerId: userId, ownerType: 'user' };
  }

  private static self(userId: string): OwnershipPrincipal {
    return { principalId: userId };
  }

  /** The wallet's total spendable balance (whole credits), derived from the ledger. */
  async getBalance(userId: string): Promise<number> {
    const balance = await this.wallet.getBalance(
      QuantAdsCreditsWallet.self(userId),
      QuantAdsCreditsWallet.owner(userId),
    );
    return balance.total;
  }

  /**
   * Credit `userId` exactly once for `key` (idempotent). Used for coin buys
   * (`kind: 'purchase'`) and earned rewards (e.g. `kind: 'referral'`). Returns
   * whether this call actually appended (false = replay of a prior grant).
   */
  async grantOnce(
    userId: string,
    amount: number,
    kind: CreditKind,
    key: string,
    sourceRef?: string,
    reason?: string,
  ): Promise<{ credited: boolean }> {
    const already = await this.hasEntry(userId, key);
    await this.wallet.creditOnce(
      QuantAdsCreditsWallet.owner(userId),
      {
        amount,
        kind,
        ...(sourceRef ? { sourceRef } : {}),
        ...(reason ? { reason } : {}),
      },
      key,
    );
    return { credited: !already };
  }

  /** Debit `userId` once for `spendId` (idempotent, fail-closed). */
  async spend(
    userId: string,
    amount: number,
    spendId: string,
    reason?: string,
  ): Promise<SpendResult> {
    return this.transfers.spend({
      spendId,
      owner: QuantAdsCreditsWallet.owner(userId),
      amountCredits: amount,
      ...(reason ? { reason } : {}),
    });
  }

  /**
   * Move `amount` from `fromUserId` to `toUserId` atomically, idempotent by
   * `transferId`. `creditKind` controls the recipient leg (default `adjustment`
   * spendable; pass an earn-kind like `referral` for a withdrawable tip).
   */
  async transfer(
    fromUserId: string,
    toUserId: string,
    amount: number,
    transferId: string,
    creditKind?: CreditKind,
    reason?: string,
  ): Promise<TransferResult> {
    return this.transfers.transfer({
      transferId,
      from: QuantAdsCreditsWallet.owner(fromUserId),
      to: QuantAdsCreditsWallet.owner(toUserId),
      amountCredits: amount,
      ...(creditKind ? { creditKind } : {}),
      ...(reason ? { reason } : {}),
    });
  }

  /** True if a ledger entry with the given idempotency `actionKey` exists for the user. */
  async hasEntry(userId: string, actionKey: string): Promise<boolean> {
    const entries = await this.wallet.listEntries(
      QuantAdsCreditsWallet.self(userId),
      QuantAdsCreditsWallet.owner(userId),
    );
    return entries.some((e) => e.actionKey === actionKey);
  }
}
