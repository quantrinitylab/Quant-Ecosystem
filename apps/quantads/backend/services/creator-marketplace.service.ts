// ============================================================================
// QuantAds — creator marketplace purchase (real @quant/credits MarketplaceLedger)
// ============================================================================
//
// The real creator-monetization path: a buyer purchases a durable creator
// listing in credits; the money settles atomically on the append-only ledger
// via MarketplaceLedger — buyer debit + seller withdrawable `marketplace_sale`
// earn + platform treasury commission — idempotent per purchaseId, fail-closed
// on insufficient buyer balance. The seller's proceeds are then real,
// ledger-visible EARNED credits (getEarnedTotal) that a withdrawal (PayoutService)
// can cash out. This replaces the prior inert RevenueSplitEngine (earnings
// were always 0 because no purchase path recorded a sale).

import {
  MarketplaceLedger,
  CreditWallet,
  type PayoutRail,
  type PayoutDispatchResult,
  type PurchaseResult,
} from '@quant/credits';
import { createAppError } from '@quant/server-core';
import { DurableCreatorListingService } from './creator-listing.service.js';

/** Platform commission on a creator sale: platform 30%, creator keeps 70%. */
export const CREATOR_COMMISSION_RATE = 0.3;

/**
 * A fail-closed payout rail: it reports itself unconfigured so PayoutService
 * rejects a withdrawal with 503 PROVIDER_NOT_CONFIGURED BEFORE reserving any
 * funds. A real UPI/crypto/bank rail (env-configured SDK) is a needs-staging
 * concern; until one is wired, earned credits accrue durably but cannot be
 * disbursed (never faked as completed).
 */
export class NullPayoutRail implements PayoutRail {
  readonly id = 'null';
  isConfigured(): boolean {
    return false;
  }
  async dispatch(): Promise<PayoutDispatchResult> {
    throw createAppError(
      'Payout rail is not configured (needs staging)',
      503,
      'PROVIDER_NOT_CONFIGURED',
    );
  }
}

export interface CreatorPurchaseResult extends PurchaseResult {
  /** The seller/creator the proceeds were credited to. */
  creatorId: string;
}

/** A durable buyer ownership record (mirrors the CreatorPurchase Prisma row). */
export interface CreatorPurchaseRecord {
  id: string;
  purchaseId: string;
  buyerId: string;
  listingId: string;
  sellerId: string;
  priceCredits: number;
  createdAt: Date;
}

/** The narrow Prisma slice for buyer entitlements (real PrismaClient satisfies it). */
export interface CreatorPurchasePrisma {
  creatorPurchase: {
    upsert(args: {
      where: { purchaseId: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<CreatorPurchaseRecord>;
    findMany(args: Record<string, unknown>): Promise<CreatorPurchaseRecord[]>;
    findFirst(args: { where: Record<string, unknown> }): Promise<CreatorPurchaseRecord | null>;
  };
}

export class CreatorMarketplaceService {
  private readonly listings: DurableCreatorListingService;
  private readonly ledger: MarketplaceLedger;
  private readonly wallet: CreditWallet;
  private readonly prisma: CreatorPurchasePrisma;

  constructor(prisma: unknown) {
    this.listings = new DurableCreatorListingService(prisma as never);
    this.ledger = new MarketplaceLedger(prisma as never, {
      defaultCommissionRate: CREATOR_COMMISSION_RATE,
    });
    this.wallet = new CreditWallet(prisma as never);
    this.prisma = prisma as CreatorPurchasePrisma;
  }

  /**
   * Buy a creator listing. Looks up the durable listing, settles the purchase
   * atomically on the ledger (idempotent per `purchaseId`), THEN records the
   * buyer's durable ownership entitlement with an idempotent upsert keyed by the
   * same `purchaseId`.
   *
   * ORDER + RECONCILE: money settles first (fail-closed — an insufficient
   * balance throws before any entitlement is written, so there is never an
   * entitlement without payment). The entitlement upsert is keyed by the unique
   * `purchaseId`, so a retry after a crash between settlement and the
   * entitlement write reconciles (the ledger leg replays harmlessly and the
   * entitlement is created) and a replay never double-grants.
   *
   * @throws 404 LISTING_NOT_FOUND   no such listing.
   * @throws 400 LISTING_NOT_ACTIVE  the listing is delisted.
   * @throws 400 INVALID_PARTIES     buyer is the seller (can't buy own listing).
   * @throws 402 OUT_OF_CREDITS      buyer cannot fund the price (nothing moves).
   */
  async purchase(
    buyerId: string,
    listingId: string,
    purchaseId: string,
  ): Promise<CreatorPurchaseResult> {
    const listing = await this.listings.getListing(listingId);
    if (!listing) {
      throw createAppError('Listing not found', 404, 'LISTING_NOT_FOUND');
    }
    if (listing.status !== 'active') {
      throw createAppError('Listing is not active', 400, 'LISTING_NOT_ACTIVE');
    }
    const result = await this.ledger.purchase({
      purchaseId,
      buyer: { ownerId: buyerId, ownerType: 'user' },
      seller: { ownerId: listing.creatorId, ownerType: 'user' },
      listingId,
      priceCredits: listing.priceCredits,
    });

    // Durable entitlement — idempotent by purchaseId (reconciles retries, never
    // double-grants). Runs after the money has settled.
    await this.prisma.creatorPurchase.upsert({
      where: { purchaseId },
      create: {
        purchaseId,
        buyerId,
        listingId,
        sellerId: listing.creatorId,
        priceCredits: listing.priceCredits,
      },
      update: {},
    });

    return { ...result, creatorId: listing.creatorId };
  }

  /** A buyer's owned purchases, newest first ("my purchases"). */
  async getPurchases(buyerId: string): Promise<CreatorPurchaseRecord[]> {
    return this.prisma.creatorPurchase.findMany({
      where: { buyerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Access gate: has `buyerId` purchased `listingId`? */
  async hasPurchased(buyerId: string, listingId: string): Promise<boolean> {
    const row = await this.prisma.creatorPurchase.findFirst({ where: { buyerId, listingId } });
    return row != null;
  }

  /** A creator's real, ledger-visible EARNED (cash-out-eligible) credit total. */
  async getCreatorEarnings(creatorId: string): Promise<number> {
    return this.wallet.getEarnedTotal(
      { principalId: creatorId },
      { ownerId: creatorId, ownerType: 'user' },
    );
  }
}
