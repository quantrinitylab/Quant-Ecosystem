// ============================================================================
// MarketplaceLedger — atomic in-credits purchase of a digital good, with a
// platform commission split. Part of @quant/credits.
// ============================================================================
//
// MODEL
//   The Quant economy runs on ONE currency: credits. Users buy and sell digital
//   goods (game items, skins, coins, boosts, creator assets) in credits. A
//   purchase moves credits from the buyer to the seller, minus a platform
//   commission, as a SINGLE atomic settlement over the append-only ledger:
//
//     buyer  -price                       (debit, keyed mkt:{purchaseId})
//     seller +price*(1-commission)         (creditOnce marketplace_sale)   -> earned, withdrawable
//     treasury +price*commission           (creditOnce adjustment)         -> platform revenue
//
//   CORRECTNESS (design "Correctness Properties" 6):
//     • ATOMIC — all three legs run inside one DB transaction; a failure in any
//       leg rolls the whole purchase back (no partial application).
//     • IDEMPOTENT — every leg is keyed off a stable `purchaseId`, so a retried
//       or duplicated request settles at most once (no double-spend / double
//       delivery). A replay returns the original settlement.
//     • FAIL CLOSED — an insufficient buyer balance (overage is enforced by the
//       wallet/usage-gate upstream, OFF by default) rejects the WHOLE unit with
//       OUT_OF_CREDITS before anything is credited.
//
//   The seller leg uses the `marketplace_sale` earn-kind, so a seller's proceeds
//   count toward their EARNED, cash-out-eligible balance (PayoutService). The
//   commission leg credits the configured platform treasury owner.

import { createAppError } from './errors';
import type { Credits } from './pricing-engine.service';
import type { TransactionRunner } from './tx';
import { CreditWallet, type OwnerRef, type CreditWalletOptions } from './credit-wallet.service';

/** A prisma client able to open an interactive transaction (`$transaction(fn)`). */
export interface MarketplacePrisma {
  $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
}

export interface MarketplaceLedgerOptions {
  /**
   * The owner ref of the platform treasury wallet that receives commission.
   * Defaults to the synthetic platform owner `{ ownerId: 'platform', ownerType: 'org' }`.
   */
  treasury?: OwnerRef;
  /**
   * Default commission rate in [0, 1) applied when a purchase does not specify
   * one. Defaults to 0 (no commission) so callers must opt in.
   */
  defaultCommissionRate?: number;
  /** Options threaded into the transaction-scoped {@link CreditWallet}. */
  walletOptions?: Pick<CreditWalletOptions, 'generateId' | 'authz' | 'dailyAllowanceProvider'>;
}

/** Arguments to {@link MarketplaceLedger.purchase}. */
export interface PurchaseInput {
  /**
   * A stable idempotency key for this purchase intent. The same id replayed
   * settles at most once. Callers SHOULD derive it from a crypto-strong source
   * (e.g. `crypto.randomUUID()`), never `Math.random()`.
   */
  purchaseId: string;
  /** The buyer's wallet (debited). */
  buyer: OwnerRef;
  /** The seller's wallet (credited the net proceeds). */
  seller: OwnerRef;
  /** An identifier of the listing/item being purchased (for provenance). */
  listingId: string;
  /** The whole-credit price the buyer pays (> 0). */
  priceCredits: Credits;
  /** Commission rate in [0, 1); overrides the configured default when set. */
  commissionRate?: number;
}

/** The settled result of a {@link MarketplaceLedger.purchase}. */
export interface PurchaseResult {
  purchaseId: string;
  listingId: string;
  /** Whole credits debited from the buyer (== priceCredits). */
  priceCredits: Credits;
  /** Whole credits credited to the seller (price - commission). */
  sellerProceeds: Credits;
  /** Whole credits credited to the platform treasury. */
  commissionCredits: Credits;
  /** True when this call replayed an already-settled purchase (no new movement). */
  replayed: boolean;
}

const DEFAULT_TREASURY: OwnerRef = { ownerId: 'platform', ownerType: 'org' };

function isPositiveWholeCredits(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n > 0;
}

function isValidRate(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 1;
}

export class MarketplaceLedger {
  private readonly treasury: OwnerRef;
  private readonly defaultCommissionRate: number;
  private readonly walletOptions: MarketplaceLedgerOptions['walletOptions'];

  constructor(
    private readonly prisma: MarketplacePrisma,
    options: MarketplaceLedgerOptions = {},
  ) {
    this.treasury = options.treasury ?? DEFAULT_TREASURY;
    this.defaultCommissionRate = options.defaultCommissionRate ?? 0;
    this.walletOptions = options.walletOptions;
  }

  /**
   * Settle a purchase atomically: debit the buyer, credit the seller their net
   * proceeds, and credit the platform treasury the commission — all inside one
   * transaction, keyed by `purchaseId` for idempotency.
   *
   * @throws 400 INVALID_AMOUNT          price is not a positive whole number.
   * @throws 400 INVALID_COMMISSION_RATE rate is outside [0, 1).
   * @throws 400 INVALID_PARTIES         buyer/seller/listing missing, or buyer == seller.
   * @throws 402 OUT_OF_CREDITS          buyer cannot fund the price (nothing moves).
   */
  async purchase(input: PurchaseInput): Promise<PurchaseResult> {
    if (!input?.purchaseId) {
      throw createAppError('purchaseId is required', 400, 'PURCHASE_ID_REQUIRED');
    }
    if (!input.buyer?.ownerId || !input.seller?.ownerId || !input.listingId) {
      throw createAppError('buyer, seller and listingId are required', 400, 'INVALID_PARTIES');
    }
    if (input.buyer.ownerId === input.seller.ownerId) {
      throw createAppError('buyer and seller must differ', 400, 'INVALID_PARTIES');
    }
    if (!isPositiveWholeCredits(input.priceCredits)) {
      throw createAppError(
        'priceCredits must be a positive whole number of credits',
        400,
        'INVALID_AMOUNT',
      );
    }
    const rate = input.commissionRate ?? this.defaultCommissionRate;
    if (!isValidRate(rate)) {
      throw createAppError('commissionRate must be in [0, 1)', 400, 'INVALID_COMMISSION_RATE');
    }

    // Commission floors so seller + commission == price exactly (whole credits).
    const commissionCredits = Math.floor(input.priceCredits * rate);
    const sellerProceeds = input.priceCredits - commissionCredits;

    const buyerDebitKey = `mkt:${input.purchaseId}`;
    const sellerCreditKey = `mkt-sale:${input.purchaseId}`;
    const commissionKey = `mkt-commission:${input.purchaseId}`;
    const provenance = `mkt:${input.listingId}:${input.purchaseId}`;

    // ATOMIC: one transaction wraps the whole settlement. The transaction-scoped
    // wallet uses the tx client so every ledger row is created (or none are).
    const run = this.prisma.$transaction.bind(this.prisma) as TransactionRunner;
    return run(async (tx: unknown) => {
      const wallet = new CreditWallet(tx as never, this.walletOptions ?? {});

      // 1) BUYER DEBIT (idempotent + fail-closed). A replay returns the prior
      //    debit; an insufficient balance throws OUT_OF_CREDITS before any
      //    credit is appended, so a failed purchase moves nothing.
      const debit = await wallet.debit(input.buyer, input.priceCredits, buyerDebitKey, {
        sourceRef: provenance,
        reason: `marketplace purchase of ${input.listingId}`,
      });

      // 2) SELLER CREDIT (idempotent earn). marketplace_sale -> withdrawable.
      await wallet.creditOnce(
        input.seller,
        {
          amount: sellerProceeds,
          kind: 'marketplace_sale',
          sourceRef: provenance,
          reason: `marketplace sale of ${input.listingId}`,
        },
        sellerCreditKey,
      );

      // 3) COMMISSION CREDIT to the platform treasury (idempotent).
      if (commissionCredits > 0) {
        await wallet.creditOnce(
          this.treasury,
          {
            amount: commissionCredits,
            kind: 'adjustment',
            sourceRef: provenance,
            reason: `marketplace commission for ${input.listingId}`,
          },
          commissionKey,
        );
      }

      return {
        purchaseId: input.purchaseId,
        listingId: input.listingId,
        priceCredits: input.priceCredits,
        sellerProceeds,
        commissionCredits,
        replayed: debit.replayed,
      };
    });
  }
}
