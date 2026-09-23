export interface AdCandidate {
  id: string;
  campaignId: string;
  advertiserId: string;
  bidCents: number;
  predictedCtr: number; // e.g. 0.02 (2%)
  predictedCvr: number; // e.g. 0.05 (5%)
  qualityScore: number; // 1 to 10 scale (normalized to 0.1 - 1.0)
  creativeUrl: string;
}

export interface AuctionResult {
  winner: AdCandidate;
  clearingPriceCents: number;
  adRank: number;
  effectiveEcpm: number;
  creatorShareCents: number; // 70% of gross clearing price
}

export class EcpmAuctionEngine {
  public static calculateAdRank(candidate: AdCandidate): number {
    // eCPM = Bid * pCTR * QualityScore * 1000
    const normQuality = Math.max(0.1, Math.min(1.0, candidate.qualityScore / 10));
    return candidate.bidCents * candidate.predictedCtr * normQuality * 1000;
  }

  public static runGspAuction(
    candidates: AdCandidate[],
    reservePriceCents = 5,
  ): AuctionResult | null {
    if (!candidates || candidates.length === 0) return null;

    // Rank candidates by eCPM AdRank
    const ranked = candidates
      .map((c) => ({ candidate: c, adRank: this.calculateAdRank(c) }))
      .sort((a, b) => b.adRank - a.adRank);

    const winnerItem = ranked[0];
    if (!winnerItem) return null;

    let clearingPriceCents: number;
    if (ranked.length > 1) {
      // GSP: Winner pays the minimum bid needed to beat the second-place AdRank
      const runnerUp = ranked[1]!;
      const winnerQuality = Math.max(0.1, Math.min(1.0, winnerItem.candidate.qualityScore / 10));
      const minBidToBeat =
        runnerUp.adRank / (winnerItem.candidate.predictedCtr * winnerQuality * 1000);
      clearingPriceCents = Math.max(reservePriceCents, Math.ceil(minBidToBeat));
    } else {
      clearingPriceCents = reservePriceCents;
    }

    // Cap clearing price to winner's maximum bid
    clearingPriceCents = Math.min(winnerItem.candidate.bidCents, clearingPriceCents);

    // 70% goes directly to publisher/creator
    const creatorShareCents = Math.floor(clearingPriceCents * 0.7);

    return {
      winner: winnerItem.candidate,
      clearingPriceCents,
      adRank: winnerItem.adRank,
      effectiveEcpm: clearingPriceCents * winnerItem.candidate.predictedCtr * 1000,
      creatorShareCents,
    };
  }
}
