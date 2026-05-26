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

  constructor(private readonly redis: Redis) {}

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

    // Get top 2 bidders by score (ZREVRANGE with scores)
    const topBidders = await this.redis.zrevrange(key, 0, 1, 'WITHSCORES');

    // With WITHSCORES, each bidder produces 2 entries: [member, score, member, score, ...]
    // So 0 bidders = length 0, 1 bidder = length 2, 2 bidders = length 4
    if (topBidders.length < 4) {
      // Need at least 2 bidders for second-price auction
      if (topBidders.length === 0) return null;
      // Single bidder wins at their own price
      const winnerId = topBidders[0]!;
      const winningScore = parseFloat(topBidders[1]!);
      // Get original bid amount from metadata
      const metaKey = `${AuctionService.AUCTION_META_PREFIX}${auctionId}:${winnerId}`;
      const bidAmountStr = await this.redis.hget(metaKey, 'bidAmount');
      const bidAmount = bidAmountStr ? parseFloat(bidAmountStr) : winningScore;

      // Clean up bid key, active set, and metadata
      await this.redis.del(key);
      await this.redis.srem(AuctionService.ACTIVE_AUCTIONS_KEY, auctionId);
      await this.redis.del(metaKey);

      return {
        winnerId,
        winningBid: bidAmount,
        secondPrice: bidAmount,
        effectiveScore: winningScore,
      };
    }

    const winnerId = topBidders[0]!;
    const winningScore = parseFloat(topBidders[1]!);
    const secondBidderId = topBidders[2]!;
    const secondScore = parseFloat(topBidders[3]!); // second bidder's score

    // Get winner's original bid amount
    const winnerMetaKey = `${AuctionService.AUCTION_META_PREFIX}${auctionId}:${winnerId}`;
    const bidAmountStr = await this.redis.hget(winnerMetaKey, 'bidAmount');
    const winningBid = bidAmountStr ? parseFloat(bidAmountStr) : winningScore;

    // Clean up bid key and active set
    await this.redis.del(key);
    await this.redis.srem(AuctionService.ACTIVE_AUCTIONS_KEY, auctionId);

    // Clean up metadata keys for all bidders
    await this.redis.del(winnerMetaKey);
    await this.redis.del(`${AuctionService.AUCTION_META_PREFIX}${auctionId}:${secondBidderId}`);

    return { winnerId, winningBid, secondPrice: secondScore, effectiveScore: winningScore };
  }

  /**
   * Get all active auction IDs
   */
  async getActiveAuctions(): Promise<string[]> {
    return this.redis.smembers(AuctionService.ACTIVE_AUCTIONS_KEY);
  }

  /**
   * Cancel a bid from an auction
   */
  async cancelBid(auctionId: string, bidderId: string): Promise<boolean> {
    const key = `${AuctionService.AUCTION_KEY_PREFIX}${auctionId}`;
    const removed = await this.redis.zrem(key, bidderId);

    const metaKey = `${AuctionService.AUCTION_META_PREFIX}${auctionId}:${bidderId}`;
    await this.redis.del(metaKey);

    return removed > 0;
  }
}
