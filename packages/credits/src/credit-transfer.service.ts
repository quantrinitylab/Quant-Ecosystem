// ============================================================================
// CreditTransferService — peer-to-peer transfers + spends on the credit ledger.
// Part of @quant/credits.
// ============================================================================
//
// The generic ledger primitives the ecosystem's coin-economy features map onto,
// so they no longer need a separate in-memory wallet:
//
//   • transfer(from -> to)  — gifting, tipping, peer sends. Atomic: debit the
//     sender, credit the recipient, inside ONE transaction, keyed off a stable
//     transferId so a replay settles at most once (no double-spend).
//   • spend(owner)          — boosts, coin-store item consumption, subscription
//     charges. A single idempotent debit keyed off a stable spendId.
//
// Both are async + ledger-backed (append-only CreditLedgerEntry via CreditWallet)
// and FAIL CLOSED: an insufficient balance throws OUT_OF_CREDITS before anything
// moves (overage is off by default upstream). This is the P1 primitive that
// gives gifting/boost/tipping/store/subscription a durable home in @quant/credits.

import { createAppError } from './errors';
import type { Credits } from './pricing-engine.service';
import type { TransactionRunner } from './tx';
import {
  CreditWallet,
  type OwnerRef,
  type CreditKind,
  type CreditWalletOptions,
} from './credit-wallet.service';

/** A prisma client able to open an interactive transaction (`$transaction(fn)`). */
export interface CreditTransferPrisma {
  $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
}

export interface CreditTransferServiceOptions {
  /** Options threaded into the transaction-scoped {@link CreditWallet}. */
  walletOptions?: Pick<CreditWalletOptions, 'generateId' | 'authz' | 'dailyAllowanceProvider'>;
}

export interface TransferInput {
  /** Stable idempotency key (crypto-strong; never Math.random). */
  transferId: string;
  /** The sender's wallet (debited). */
  from: OwnerRef;
  /** The recipient's wallet (credited). */
  to: OwnerRef;
  /** Whole credits to move (> 0). */
  amountCredits: Credits;
  /**
   * The credit-kind for the recipient leg. Defaults to `adjustment` (spendable,
   * non-earned). Pass an earn-kind (e.g. `referral`) when the recipient's credit
   * should be withdrawal-eligible (e.g. a creator tip).
   */
  creditKind?: CreditKind;
  reason?: string;
}

export interface TransferResult {
  transferId: string;
  amountCredits: Credits;
  /** True when this call replayed an already-settled transfer (no new movement). */
  replayed: boolean;
}

export interface SpendInput {
  /** Stable idempotency key. */
  spendId: string;
  /** The spender's wallet (debited). */
  owner: OwnerRef;
  /** Whole credits to spend (> 0). */
  amountCredits: Credits;
  reason?: string;
}

export interface SpendResult {
  spendId: string;
  amountCredits: Credits;
  replayed: boolean;
}

function isPositiveWholeCredits(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n > 0;
}

export class CreditTransferService {
  private readonly walletOptions: CreditTransferServiceOptions['walletOptions'];

  constructor(
    private readonly prisma: CreditTransferPrisma,
    options: CreditTransferServiceOptions = {},
  ) {
    this.walletOptions = options.walletOptions;
  }

  /**
   * Move credits from one owner to another atomically (debit + credit in one
   * transaction), idempotent by `transferId`.
   *
   * @throws 400 TRANSFER_ID_REQUIRED  transferId is empty.
   * @throws 400 INVALID_PARTIES       from/to missing, or from == to.
   * @throws 400 INVALID_AMOUNT        amount is not a positive whole number.
   * @throws 402 OUT_OF_CREDITS        sender cannot fund the transfer (nothing moves).
   */
  async transfer(input: TransferInput): Promise<TransferResult> {
    if (!input?.transferId) {
      throw createAppError('transferId is required', 400, 'TRANSFER_ID_REQUIRED');
    }
    if (!input.from?.ownerId || !input.to?.ownerId) {
      throw createAppError('from and to are required', 400, 'INVALID_PARTIES');
    }
    if (input.from.ownerId === input.to.ownerId) {
      throw createAppError('from and to must differ', 400, 'INVALID_PARTIES');
    }
    if (!isPositiveWholeCredits(input.amountCredits)) {
      throw createAppError(
        'amountCredits must be a positive whole number of credits',
        400,
        'INVALID_AMOUNT',
      );
    }

    const debitKey = `xfer:${input.transferId}`;
    const creditKey = `xfer-in:${input.transferId}`;
    const provenance = `xfer:${input.transferId}`;
    const creditKind = input.creditKind ?? 'adjustment';

    const run = this.prisma.$transaction.bind(this.prisma) as TransactionRunner;
    return run(async (tx: unknown) => {
      const wallet = new CreditWallet(tx as never, this.walletOptions ?? {});

      // 1) SENDER DEBIT — idempotent + fail-closed (OUT_OF_CREDITS before credit).
      const debit = await wallet.debit(input.from, input.amountCredits, debitKey, {
        sourceRef: provenance,
        ...(input.reason ? { reason: input.reason } : {}),
      });

      // 2) RECIPIENT CREDIT — idempotent.
      await wallet.creditOnce(
        input.to,
        {
          amount: input.amountCredits,
          kind: creditKind,
          sourceRef: provenance,
          ...(input.reason ? { reason: input.reason } : {}),
        },
        creditKey,
      );

      return {
        transferId: input.transferId,
        amountCredits: input.amountCredits,
        replayed: debit.replayed,
      };
    });
  }

  /**
   * Spend (debit) credits from an owner — for boosts, coin-store consumption,
   * subscription charges. Idempotent by `spendId`, fail-closed.
   *
   * @throws 400 SPEND_ID_REQUIRED  spendId is empty.
   * @throws 400 OWNER_REF_REQUIRED owner missing.
   * @throws 400 INVALID_AMOUNT     amount is not a positive whole number.
   * @throws 402 OUT_OF_CREDITS     owner cannot fund the spend (nothing moves).
   */
  async spend(input: SpendInput): Promise<SpendResult> {
    if (!input?.spendId) {
      throw createAppError('spendId is required', 400, 'SPEND_ID_REQUIRED');
    }
    if (!input.owner?.ownerId) {
      throw createAppError('owner.ownerId is required', 400, 'OWNER_REF_REQUIRED');
    }
    if (!isPositiveWholeCredits(input.amountCredits)) {
      throw createAppError(
        'amountCredits must be a positive whole number of credits',
        400,
        'INVALID_AMOUNT',
      );
    }

    const wallet = new CreditWallet(this.prisma as never, this.walletOptions ?? {});
    const debit = await wallet.debit(input.owner, input.amountCredits, `spend:${input.spendId}`, {
      sourceRef: `spend:${input.spendId}`,
      ...(input.reason ? { reason: input.reason } : {}),
    });
    return {
      spendId: input.spendId,
      amountCredits: input.amountCredits,
      replayed: debit.replayed,
    };
  }
}
