// ============================================================================
// CreatorEarningsService — the single entry point every app uses to pay a
// creator. Posts earnings to the shared append-only ledger as EARNED,
// withdrawable credits. Part of @quant/credits.
// ============================================================================
//
// PURPOSE
//   Req 3 of the credits economy: a creator's earnings from ANY app
//   (QuantTube/QuantSync/QuantNeon/QuantMax/QuantEdits monetization, post/reel
//   boosts, QuantChat streaks, QuantAds revenue share, referrals) land as
//   credits in ONE shared wallet, so they can be withdrawn in one place
//   (PayoutService) — paid out as credits (1 credit ≈ 1 USD).
//
//   This service is the app-facing facade over CreditWallet.creditOnce: it maps
//   a business earning `source` to the right ledger earn-kind, tags the entry
//   with the originating app + reference (for accounting), and is IDEMPOTENT by
//   a stable `earningId` so a retried payout job / ad-settlement webhook never
//   double-credits.

import { createAppError } from './errors';
import type { CreditLedgerEntry } from '@quant/database';
import type { Credits } from './pricing-engine.service';
import { CreditWallet, type OwnerRef, type CreditKind } from './credit-wallet.service';

/** The apps that can post creator earnings. */
export type EarningApp =
  | 'quanttube'
  | 'quantsync'
  | 'quantneon'
  | 'quantmax'
  | 'quantedits'
  | 'quantchat'
  | 'quantads'
  | 'quantai';

/** The business reason a creator earned credits. */
export type EarningSource =
  | 'content_monetization' // video/post/photo monetization payout
  | 'ad_revenue' // QuantAds revenue share
  | 'boost' // a post/reel boost revenue share
  | 'streak' // QuantChat streak reward
  | 'tip' // a viewer tip / gift
  | 'referral'; // referral reward

/** Map each business source to the ledger earn-kind it records as. */
const SOURCE_KIND: Readonly<Record<EarningSource, CreditKind>> = {
  content_monetization: 'creator_payout',
  ad_revenue: 'creator_payout',
  boost: 'boost_earning',
  streak: 'streak_reward',
  tip: 'creator_payout',
  referral: 'referral',
};

/** Arguments to {@link CreatorEarningsService.record}. */
export interface RecordEarningInput {
  /** The creator being paid (their shared wallet). */
  creator: OwnerRef;
  /** Which app the earning originated in (for accounting/provenance). */
  app: EarningApp;
  /** The business reason for the earning. */
  source: EarningSource;
  /** Whole-credit amount to credit (> 0; 1 credit ≈ 1 USD). */
  amountCredits: Credits;
  /**
   * A STABLE id for this earning event (e.g. the ad-settlement id, the payout
   * batch line id, the boost id). The credit is idempotent on `earningId`, so a
   * retried job credits at most once.
   */
  earningId: string;
  /** Optional human-readable note recorded on the ledger entry. */
  note?: string;
}

export interface CreatorEarningsServiceOptions {
  /** Override the set of apps allowed to post earnings (defaults to all). */
  allowedApps?: ReadonlySet<EarningApp>;
}

function isPositiveWholeCredits(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n > 0;
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

export class CreatorEarningsService {
  private readonly allowedApps?: ReadonlySet<EarningApp>;

  constructor(
    private readonly wallet: CreditWallet,
    options: CreatorEarningsServiceOptions = {},
  ) {
    this.allowedApps = options.allowedApps;
  }

  /**
   * Record a creator earning to the shared ledger as EARNED, withdrawable
   * credits. Idempotent on `earningId`.
   *
   * @throws 400 INVALID_AMOUNT     amount is not a positive whole number.
   * @throws 400 EARNING_ID_REQUIRED earningId is missing.
   * @throws 400 INVALID_SOURCE     source is not a known earning source.
   * @throws 400 APP_NOT_ALLOWED    app is outside the allowed set.
   */
  async record(input: RecordEarningInput): Promise<CreditLedgerEntry> {
    if (!nonEmpty(input?.creator?.ownerId)) {
      throw createAppError('creator.ownerId is required', 400, 'OWNER_REF_REQUIRED');
    }
    if (!isPositiveWholeCredits(input?.amountCredits)) {
      throw createAppError(
        'earning amount must be a positive whole number of credits',
        400,
        'INVALID_AMOUNT',
      );
    }
    if (!nonEmpty(input?.earningId)) {
      throw createAppError('earningId is required for idempotency', 400, 'EARNING_ID_REQUIRED');
    }
    const kind = SOURCE_KIND[input.source];
    if (kind == null) {
      throw createAppError(
        `Invalid earning source '${String(input.source)}'`,
        400,
        'INVALID_SOURCE',
      );
    }
    if (this.allowedApps != null && !this.allowedApps.has(input.app)) {
      throw createAppError(
        `App '${String(input.app)}' may not post earnings`,
        400,
        'APP_NOT_ALLOWED',
      );
    }

    // Provenance: app + source + earning id make the entry traceable for
    // accounting and reconciliation. Idempotency key namespaces by app+source so
    // ids from different apps never collide.
    const actionKey = `earn:${input.app}:${input.source}:${input.earningId}`;
    const sourceRef = `${input.app}:${input.source}:${input.earningId}`;

    return this.wallet.creditOnce(
      input.creator,
      {
        amount: input.amountCredits,
        kind,
        sourceRef,
        reason: input.note ?? `${input.source} earning from ${input.app}`,
      },
      actionKey,
    );
  }

  /**
   * Convenience for QuantAds: route a creator's ad revenue share to their shared
   * wallet as earned credits. `settlementId` is the idempotency key.
   */
  async recordAdRevenueShare(args: {
    creator: OwnerRef;
    amountCredits: Credits;
    settlementId: string;
    note?: string;
  }): Promise<CreditLedgerEntry> {
    return this.record({
      creator: args.creator,
      app: 'quantads',
      source: 'ad_revenue',
      amountCredits: args.amountCredits,
      earningId: args.settlementId,
      note: args.note,
    });
  }
}
