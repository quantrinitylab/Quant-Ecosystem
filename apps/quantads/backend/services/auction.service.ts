import type { Redis } from 'ioredis';
import { z } from 'zod';

export const SubmitBidSchema = z.object({
  auctionId: z.string().min(1),
  bidderId: z.string().min(1),
  bidAmount: z.number().positive(),
  qualityScore: z.number().min(0).max(1),
});

export type SubmitBidInput = z.infer<typeof SubmitBidSchema>;

export interface BidEntry {
  bidderId: string;
  bidAmount: number;
  qualityScore: number;
  effectiveScore: number;
  timestamp: number;
}

export interface AuctionResult {
  winnerId: string;
  winningBid: number;
  secondPrice: number; // winner pays this (second-price auction)
  effectiveScore: number;
}

/**
 * AuctionService - Real-time ad auction using Redis sorted sets
 *
 * Implements a second-price (Vickrey) auction:
 * - Bids are stored with ZADD where score = bidAmount * qualityScore (effective score)
 * - Resolution uses ZREVRANGE to get top bidders
 * - Winner pays the second-highest effective score
 */
export class AuctionService {
  private static readonly AUCTION_KEY_PREFIX = 'auction:bids:';
  private static readonly AUCTION_META_PREFIX = 'auction:meta:';
  private static readonly ACTIVE_AUCTIONS_KEY = 'auctions:active';

  /**
   * Defense-in-depth TTL (seconds) applied to a bid sorted-set and each bid
   * metadata hash at submit time, so an auction that is NEVER resolved (crash,
   * lost timer) cannot leak its keys forever. Deterministic resolution still
   * deletes the keys immediately; this is only a backstop. Default 24h.
   */
  private readonly keyTtlSeconds: number;

  constructor(
    private readonly redis: Redis,
    options: { keyTtlSeconds?: number } = {},
  ) {
    this.keyTtlSeconds = options.keyTtlSeconds ?? 86_400;
  }

  /**
   * Submit a bid to an auction
   * Score = bidAmount * qualityScore (effective score for ranking)
   */
  async submitBid(input: SubmitBidInput): Promise<BidEntry> {
    const validated = SubmitBidSchema.parse(input);
    const effectiveScore = validated.bidAmount * validated.qualityScore;
    const key = `${AuctionService.AUCTION_KEY_PREFIX}${validated.auctionId}`;

    // Store bid with ZADD (score = effectiveScore)
    await this.redis.zadd(key, effectiveScore, validated.bidderId);

    // Store bid metadata as hash
    const metaKey = `${AuctionService.AUCTION_META_PREFIX}${validated.auctionId}:${validated.bidderId}`;
    const timestamp = Date.now();
    await this.redis.hset(metaKey, {
      bidderId: validated.bidderId,
      bidAmount: String(validated.bidAmount),
      qualityScore: String(validated.qualityScore),
      effectiveScore: String(effectiveScore),
      timestamp: String(timestamp),
    });

    // Track active auction
    await this.redis.sadd(AuctionService.ACTIVE_AUCTIONS_KEY, validated.auctionId);

    // Defense-in-depth: bound the lifetime of the bid set + this bidder's meta
    // so an auction that is never resolved cannot leak keys forever. Resolution
    // deletes them immediately; this only backstops the never-resolved case.
    await this.redis.expire(key, this.keyTtlSeconds);
    await this.redis.expire(metaKey, this.keyTtlSeconds);

    return {
      bidderId: validated.bidderId,
      bidAmount: validated.bidAmount,
      qualityScore: validated.qualityScore,
      effectiveScore,
      timestamp,
    };
  }

  /**
   * Resolve an auction using second-price (Vickrey) mechanism
   * Winner is highest effective score, pays second-highest effective score
   */
  async resolveAuction(auctionId: string): Promise<AuctionResult | null> {
    const key = `${AuctionService.AUCTION_KEY_PREFIX}${auctionId}`;

    // Enumerate EVERY bidder up front so we can clean ALL of their metadata
    // hashes on resolution — not just the top two. ZREVRANGE 0,1 only surfaces
    // the winner + runner-up, so any 3rd+ bidder's `auction:meta:*` hash would
    // otherwise be orphaned forever (no TTL reaped it deterministically).
    const allBidders = await this.redis.zrange(key, 0, -1);

    // Get top 2 bidders by score (ZREVRANGE with scores)
    const topBidders = await this.redis.zrevrange(key, 0, 1, 'WITHSCORES');

    // With WITHSCORES, each bidder produces 2 entries: [member, score, member, score, ...]
    // So 0 bidders = length 0, 1 bidder = length 2, 2 bidders = length 4
    if (topBidders.length === 0) {
      // No bids (e.g. every bid was cancelled): reap the active-set entry and
      // any leftover keys so the auction id does not linger as an orphan.
      await this.cleanupAuction(auctionId, allBidders);
      return null;
    }

    let result: AuctionResult;
    if (topBidders.length < 4) {
      // Single bidder wins at their own price
      const winnerId = topBidders[0]!;
      const winningScore = parseFloat(topBidders[1]!);
      const bidAmount = await this.readBidAmount(auctionId, winnerId, winningScore);
      result = {
        winnerId,
        winningBid: bidAmount,
        secondPrice: bidAmount,
        effectiveScore: winningScore,
      };
    } else {
      const winnerId = topBidders[0]!;
      const winningScore = parseFloat(topBidders[1]!);
      const secondScore = parseFloat(topBidders[3]!); // second bidder's score
      const winningBid = await this.readBidAmount(auctionId, winnerId, winningScore);
      result = { winnerId, winningBid, secondPrice: secondScore, effectiveScore: winningScore };
    }

    // Read bid amounts BEFORE cleanup, then remove the bid set, the active-set
    // entry, and EVERY bidder's metadata hash (idempotent — del/srem are safe to
    // repeat), leaving no orphaned keys regardless of bidder count.
    await this.cleanupAuction(auctionId, allBidders);
    return result;
  }

  /** Read a bidder's original bid amount from their metadata (fallback to score). */
  private async readBidAmount(
    auctionId: string,
    bidderId: string,
    fallback: number,
  ): Promise<number> {
    const metaKey = `${AuctionService.AUCTION_META_PREFIX}${auctionId}:${bidderId}`;
    const bidAmountStr = await this.redis.hget(metaKey, 'bidAmount');
    return bidAmountStr ? parseFloat(bidAmountStr) : fallback;
  }

  /**
   * Remove all Redis state for an auction: the bid sorted-set, the active-set
   * entry, and every supplied bidder's metadata hash. Idempotent — safe to call
   * more than once (a double resolve/cleanup is a no-op).
   */
  private async cleanupAuction(auctionId: string, bidderIds: string[]): Promise<void> {
    await this.redis.del(`${AuctionService.AUCTION_KEY_PREFIX}${auctionId}`);
    await this.redis.srem(AuctionService.ACTIVE_AUCTIONS_KEY, auctionId);
    for (const bidderId of bidderIds) {
      await this.redis.del(`${AuctionService.AUCTION_META_PREFIX}${auctionId}:${bidderId}`);
    }
  }

  /**
   * Get all active auction IDs
   */
  async getActiveAuctions(): Promise<string[]> {
    return this.redis.smembers(AuctionService.ACTIVE_AUCTIONS_KEY);
  }

  /**
   * Cancel a bid from an auction. Removes the bid and its metadata; if that was
   * the auction's LAST bid, also reaps the active-set entry (and the now-empty
   * bid set) so a fully-cancelled auction does not linger as an orphan.
   */
  async cancelBid(auctionId: string, bidderId: string): Promise<boolean> {
    const key = `${AuctionService.AUCTION_KEY_PREFIX}${auctionId}`;
    const removed = await this.redis.zrem(key, bidderId);

    const metaKey = `${AuctionService.AUCTION_META_PREFIX}${auctionId}:${bidderId}`;
    await this.redis.del(metaKey);

    // If no bids remain, this auction is empty — reap its active-set entry and
    // the empty sorted-set so it cannot orphan.
    const remaining = await this.redis.zcard(key);
    if (remaining === 0) {
      await this.redis.srem(AuctionService.ACTIVE_AUCTIONS_KEY, auctionId);
      await this.redis.del(key);
    }

    return removed > 0;
  }
}
