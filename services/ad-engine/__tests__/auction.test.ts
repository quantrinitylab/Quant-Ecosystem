import { describe, it, expect } from 'vitest';
import { EcpmAuctionEngine, type AdCandidate } from '../src/auction.js';
import { CreatorRevShareWorker } from '../src/rev-share-worker.js';

describe('Ad Engine GSP Auction & Revenue Share Math', () => {
  const candidateA: AdCandidate = {
    id: 'ad-1',
    campaignId: 'camp-1',
    advertiserId: 'adv-1',
    bidCents: 100,
    predictedCtr: 0.05, // 5%
    predictedCvr: 0.1,
    qualityScore: 8,
    creativeUrl: 'https://cdn.quantmail.in/ads/1.png',
  };

  const candidateB: AdCandidate = {
    id: 'ad-2',
    campaignId: 'camp-2',
    advertiserId: 'adv-2',
    bidCents: 80,
    predictedCtr: 0.04, // 4%
    predictedCvr: 0.05,
    qualityScore: 7,
    creativeUrl: 'https://cdn.quantmail.in/ads/2.png',
  };

  it('1. Returns null for empty candidate list', () => {
    expect(EcpmAuctionEngine.runGspAuction([])).toBeNull();
  });

  it('2. Single candidate clears at reserve price (default 5 cents)', () => {
    const result = EcpmAuctionEngine.runGspAuction([candidateA]);
    expect(result).not.toBeNull();
    expect(result?.winner.id).toBe('ad-1');
    expect(result?.clearingPriceCents).toBe(5);
    expect(result?.creatorShareCents).toBe(3); // 70% of 5 = 3.5 -> floor = 3
  });

  it('3. Multiple candidates: winner pays second-price clearing price', () => {
    const result = EcpmAuctionEngine.runGspAuction([candidateA, candidateB]);
    expect(result).not.toBeNull();
    expect(result?.winner.id).toBe('ad-1');
    // AdRank A: 100 * 0.05 * 0.8 * 1000 = 4000
    // AdRank B: 80 * 0.04 * 0.7 * 1000 = 2240
    // minBidToBeat = 2240 / (0.05 * 0.8 * 1000) = 2240 / 40 = 56 cents
    expect(result?.clearingPriceCents).toBe(56);
    expect(result?.creatorShareCents).toBe(Math.floor(56 * 0.7)); // 39 cents
  });

  it('4. Handles division-by-zero, NaN, and negative predictedCtr gracefully without crashing', () => {
    const zeroCtrCandidate: AdCandidate = {
      ...candidateA,
      predictedCtr: 0,
    };
    const negCtrCandidate: AdCandidate = {
      ...candidateB,
      predictedCtr: -0.01,
    };

    const result = EcpmAuctionEngine.runGspAuction([zeroCtrCandidate, negCtrCandidate]);
    expect(result).not.toBeNull();
    expect(Number.isFinite(result?.clearingPriceCents)).toBe(true);
    expect(result?.clearingPriceCents).toBeGreaterThanOrEqual(5);
    expect(Number.isFinite(result?.creatorShareCents)).toBe(true);
  });

  it('5. Creator rev-share worker calculates exact credit amount', async () => {
    const worker = new CreatorRevShareWorker('redis://127.0.0.1:6379');
    const payout = await worker.processPayout({
      eventId: 'evt-1',
      creatorId: 'creator-99',
      adId: 'ad-1',
      campaignId: 'camp-1',
      eventType: 'click',
      clearingPriceCents: 56,
      creatorShareCents: 39,
      timestamp: new Date().toISOString(),
    });

    expect(payout.credited).toBe(true);
    expect(payout.creditsAdded).toBe(0.39);
    await worker.stop();
  });
});
