import { describe, it, expect } from 'vitest';
import { AdAuctionService, type AdCandidate } from '../services/ad-auction.service';

const svc = new AdAuctionService();

function cand(over: Partial<AdCandidate> & { campaignId: string; bidCents: number }): AdCandidate {
  return {
    creativeId: `cr-${over.campaignId}`,
    remainingBudgetCents: 1_000_000,
    targeting: undefined,
    ...over,
  };
}

describe('AdAuctionService.runAuction', () => {
  it('no-fills when there are no candidates', () => {
    const r = svc.runAuction({ placementId: 'p1' }, []);
    expect(r.filled).toBe(false);
  });

  it('picks the highest bidder and charges the second price + 1', () => {
    const r = svc.runAuction({ placementId: 'p1' }, [
      cand({ campaignId: 'a', bidCents: 500 }),
      cand({ campaignId: 'b', bidCents: 300 }),
      cand({ campaignId: 'c', bidCents: 100 }),
    ]);
    expect(r).toMatchObject({
      filled: true,
      campaignId: 'a',
      clearingPriceCents: 301,
      competingBids: 3,
    });
  });

  it('charges the reserve when there is only one eligible bid', () => {
    const r = svc.runAuction({ placementId: 'p1', reservePriceCents: 50 }, [
      cand({ campaignId: 'a', bidCents: 500 }),
    ]);
    expect(r).toMatchObject({ filled: true, campaignId: 'a', clearingPriceCents: 50 });
  });

  it('never charges above the winner own bid', () => {
    // two equal bids -> second price would be bid+1, must be capped at the bid
    const r = svc.runAuction({ placementId: 'p1' }, [
      cand({ campaignId: 'a', bidCents: 200 }),
      cand({ campaignId: 'b', bidCents: 200 }),
    ]);
    expect(r.filled).toBe(true);
    if (r.filled) expect(r.clearingPriceCents).toBe(200);
  });

  it('excludes bids below the reserve', () => {
    const r = svc.runAuction({ placementId: 'p1', reservePriceCents: 400 }, [
      cand({ campaignId: 'a', bidCents: 300 }),
      cand({ campaignId: 'b', bidCents: 100 }),
    ]);
    expect(r.filled).toBe(false);
  });

  it('excludes candidates whose budget cannot cover the bid', () => {
    const r = svc.runAuction({ placementId: 'p1' }, [
      cand({ campaignId: 'a', bidCents: 500, remainingBudgetCents: 100 }),
      cand({ campaignId: 'b', bidCents: 200, remainingBudgetCents: 1000 }),
    ]);
    expect(r).toMatchObject({ filled: true, campaignId: 'b' });
  });

  describe('targeting', () => {
    it('requires a shared interest when interest targeting is set', () => {
      const candidates = [
        cand({ campaignId: 'a', bidCents: 500, targeting: { interests: ['sports'] } }),
        cand({ campaignId: 'b', bidCents: 200, targeting: { interests: ['music'] } }),
      ];
      const r = svc.runAuction(
        { placementId: 'p1', context: { interests: ['music', 'food'] } },
        candidates,
      );
      expect(r).toMatchObject({ filled: true, campaignId: 'b' });
    });

    it('enforces geo targeting', () => {
      const candidates = [
        cand({ campaignId: 'a', bidCents: 500, targeting: { geo: ['US'] } }),
        cand({ campaignId: 'b', bidCents: 200, targeting: { geo: ['IN', 'GB'] } }),
      ];
      const r = svc.runAuction({ placementId: 'p1', context: { geo: 'IN' } }, candidates);
      expect(r).toMatchObject({ filled: true, campaignId: 'b' });
    });

    it('untargeted candidates always match', () => {
      const r = svc.runAuction({ placementId: 'p1', context: { geo: 'FR' } }, [
        cand({ campaignId: 'a', bidCents: 250 }),
      ]);
      expect(r).toMatchObject({ filled: true, campaignId: 'a' });
    });
  });
});

describe('AdAuctionService.campaignsToCandidates', () => {
  it('maps campaign rows and computes remaining budget from totalSpend', () => {
    const candidates = svc.campaignsToCandidates([
      {
        id: 'c1',
        budget: { bidCents: 300, totalCents: 100000 },
        targeting: { interests: ['tech'], geo: ['US'] },
        totalSpend: 250, // dollars -> 25000 cents spent
      },
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      campaignId: 'c1',
      bidCents: 300,
      remainingBudgetCents: 75000,
    });
    expect(candidates[0]!.targeting).toEqual({ interests: ['tech'], geo: ['US'] });
  });

  it('skips campaigns with no positive bid', () => {
    const candidates = svc.campaignsToCandidates([
      { id: 'c1', budget: {}, targeting: {} },
      { id: 'c2', budget: { bidCents: 0 }, targeting: {} },
    ]);
    expect(candidates).toHaveLength(0);
  });
});
