import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuctionService, SubmitBidSchema } from '../services/auction.service';

function createMockRedis() {
  return {
    zadd: vi.fn().mockResolvedValue(1),
    zrevrange: vi.fn().mockResolvedValue([]),
    zrem: vi.fn().mockResolvedValue(1),
    sadd: vi.fn().mockResolvedValue(1),
    srem: vi.fn().mockResolvedValue(1),
    smembers: vi.fn().mockResolvedValue([]),
    del: vi.fn().mockResolvedValue(1),
    hset: vi.fn().mockResolvedValue('OK'),
    hget: vi.fn().mockResolvedValue(null),
  };
}

describe('AuctionService', () => {
  let service: AuctionService;
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    vi.clearAllMocks();
    redis = createMockRedis();
    service = new AuctionService(redis as never);
  });

  describe('submitBid', () => {
    it('stores bid with correct effective score using ZADD', async () => {
      const result = await service.submitBid({
        auctionId: 'auction-1',
        bidderId: 'bidder-1',
        bidAmount: 5.0,
        qualityScore: 0.8,
      });

      expect(result.effectiveScore).toBe(4.0); // 5.0 * 0.8
      expect(result.bidderId).toBe('bidder-1');
      expect(result.bidAmount).toBe(5.0);
      expect(result.qualityScore).toBe(0.8);
      expect(result.timestamp).toBeGreaterThan(0);

      expect(redis.zadd).toHaveBeenCalledWith('auction:bids:auction-1', 4.0, 'bidder-1');
      expect(redis.hset).toHaveBeenCalledWith(
        'auction:meta:auction-1:bidder-1',
        expect.objectContaining({
          bidderId: 'bidder-1',
          bidAmount: '5',
          qualityScore: '0.8',
          effectiveScore: '4',
        }),
      );
      expect(redis.sadd).toHaveBeenCalledWith('auctions:active', 'auction-1');
    });
  });

  describe('resolveAuction', () => {
    it('returns winner and second price with two bidders', async () => {
      // ZREVRANGE returns [member1, score1, member2, score2]
      redis.zrevrange.mockResolvedValue(['bidder-a', '8', 'bidder-b', '5']);
      redis.hget.mockResolvedValue('10'); // bidder-a original bid amount

      const result = await service.resolveAuction('auction-1');

      expect(result).not.toBeNull();
      expect(result!.winnerId).toBe('bidder-a');
      expect(result!.winningBid).toBe(10);
      expect(result!.secondPrice).toBe(5); // second bidder's effective score
      expect(result!.effectiveScore).toBe(8);

      // Should clean up
      expect(redis.del).toHaveBeenCalledWith('auction:bids:auction-1');
      expect(redis.srem).toHaveBeenCalledWith('auctions:active', 'auction-1');
    });

    it('returns winner at own price with single bidder', async () => {
      // ZREVRANGE with only one bidder returns [member, score]
      redis.zrevrange.mockResolvedValue(['bidder-only', '6']);
      redis.hget.mockResolvedValue('7.5');

      const result = await service.resolveAuction('auction-1');

      expect(result).not.toBeNull();
      expect(result!.winnerId).toBe('bidder-only');
      expect(result!.winningBid).toBe(7.5);
      expect(result!.secondPrice).toBe(7.5); // pays own price when single bidder
      expect(result!.effectiveScore).toBe(6);
    });

    it('cleans up bid key and active set for single-bidder resolution', async () => {
      redis.zrevrange.mockResolvedValue(['bidder-only', '6']);
      redis.hget.mockResolvedValue('7.5');

      await service.resolveAuction('auction-1');

      expect(redis.del).toHaveBeenCalledWith('auction:bids:auction-1');
      expect(redis.srem).toHaveBeenCalledWith('auctions:active', 'auction-1');
    });

    it('cleans up metadata keys after two-bidder resolution', async () => {
      redis.zrevrange.mockResolvedValue(['bidder-a', '8', 'bidder-b', '5']);
      redis.hget.mockResolvedValue('10');

      await service.resolveAuction('auction-1');

      expect(redis.del).toHaveBeenCalledWith('auction:meta:auction-1:bidder-a');
      expect(redis.del).toHaveBeenCalledWith('auction:meta:auction-1:bidder-b');
    });

    it('cleans up metadata key after single-bidder resolution', async () => {
      redis.zrevrange.mockResolvedValue(['bidder-only', '6']);
      redis.hget.mockResolvedValue('7.5');

      await service.resolveAuction('auction-1');

      expect(redis.del).toHaveBeenCalledWith('auction:meta:auction-1:bidder-only');
    });

    it('returns null with no bidders', async () => {
      redis.zrevrange.mockResolvedValue([]);

      const result = await service.resolveAuction('auction-1');

      expect(result).toBeNull();
    });
  });

  describe('cancelBid', () => {
    it('removes bid from sorted set and returns true', async () => {
      redis.zrem.mockResolvedValue(1);

      const result = await service.cancelBid('auction-1', 'bidder-1');

      expect(result).toBe(true);
      expect(redis.zrem).toHaveBeenCalledWith('auction:bids:auction-1', 'bidder-1');
      expect(redis.del).toHaveBeenCalledWith('auction:meta:auction-1:bidder-1');
    });

    it('returns false when bid does not exist', async () => {
      redis.zrem.mockResolvedValue(0);

      const result = await service.cancelBid('auction-1', 'nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('getActiveAuctions', () => {
    it('returns set members from Redis', async () => {
      redis.smembers.mockResolvedValue(['auction-1', 'auction-2', 'auction-3']);

      const result = await service.getActiveAuctions();

      expect(result).toEqual(['auction-1', 'auction-2', 'auction-3']);
      expect(redis.smembers).toHaveBeenCalledWith('auctions:active');
    });
  });

  describe('SubmitBidSchema validation', () => {
    it('rejects empty auctionId', () => {
      expect(() =>
        SubmitBidSchema.parse({
          auctionId: '',
          bidderId: 'bidder-1',
          bidAmount: 5,
          qualityScore: 0.5,
        }),
      ).toThrow();
    });

    it('rejects negative bidAmount', () => {
      expect(() =>
        SubmitBidSchema.parse({
          auctionId: 'auction-1',
          bidderId: 'bidder-1',
          bidAmount: -1,
          qualityScore: 0.5,
        }),
      ).toThrow();
    });

    it('rejects qualityScore above 1', () => {
      expect(() =>
        SubmitBidSchema.parse({
          auctionId: 'auction-1',
          bidderId: 'bidder-1',
          bidAmount: 5,
          qualityScore: 1.5,
        }),
      ).toThrow();
    });

    it('rejects qualityScore below 0', () => {
      expect(() =>
        SubmitBidSchema.parse({
          auctionId: 'auction-1',
          bidderId: 'bidder-1',
          bidAmount: 5,
          qualityScore: -0.1,
        }),
      ).toThrow();
    });

    it('accepts valid input', () => {
      const result = SubmitBidSchema.parse({
        auctionId: 'auction-1',
        bidderId: 'bidder-1',
        bidAmount: 10,
        qualityScore: 0.9,
      });

      expect(result.auctionId).toBe('auction-1');
      expect(result.bidAmount).toBe(10);
    });
  });
});
