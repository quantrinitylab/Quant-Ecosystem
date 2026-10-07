// ============================================================================
// QuantAd - Ad Auction Service
// ============================================================================
//
// The core of the QuantAd serving engine: given an ad request for a placement
// (with audience context), pick the winning ad from eligible campaigns via a
// sealed-bid SECOND-PRICE (Vickrey) auction with targeting + budget eligibility
// and a reserve price. Pure, deterministic logic (no I/O) so it is fully
// unit-testable; the route maps live Campaign rows into candidates and persists.

export interface AdRequestContext {
  /** audience interest tags for the current user/placement */
  interests?: string[];
  /** ISO country / region code of the viewer */
  geo?: string;
}

export interface AdRequest {
  placementId: string;
  /** reserve (floor) price in cents the publisher will accept */
  reservePriceCents?: number;
  context?: AdRequestContext;
}

export interface AdCandidate {
  campaignId: string;
  creativeId: string;
  /** advertiser's max bid (CPM/CPC cents) */
  bidCents: number;
  /** remaining campaign budget in cents */
  remainingBudgetCents: number;
  targeting?: {
    interests?: string[];
    geo?: string[];
  };
}

export type AuctionResult =
  | {
      filled: true;
      campaignId: string;
      creativeId: string;
      /** price the winner actually pays (second-price + 1, floored at reserve) */
      clearingPriceCents: number;
      /** how many candidates were eligible after filtering */
      competingBids: number;
    }
  | { filled: false; reason: string };

const DEFAULT_RESERVE = 1;

export class AdAuctionService {
  /**
   * Run a second-price auction over the candidates eligible for this request.
   * Eligibility: positive bid >= reserve, budget covers the bid, and targeting
   * (if specified) matches the request context.
   */
  runAuction(request: AdRequest, candidates: AdCandidate[]): AuctionResult {
    const reserve = Math.max(request.reservePriceCents ?? DEFAULT_RESERVE, DEFAULT_RESERVE);

    const eligible = candidates.filter((c) => this.isEligible(c, request, reserve));
    if (eligible.length === 0) {
      return { filled: false, reason: 'no eligible candidates' };
    }

    // Sort by bid desc; deterministic tie-break by campaignId so results are stable.
    const sorted = [...eligible].sort(
      (a, b) => b.bidCents - a.bidCents || a.campaignId.localeCompare(b.campaignId),
    );
    const winner = sorted[0]!;
    const second = sorted[1];

    // Second-price: pay one cent above the next-highest eligible bid, but never
    // below the reserve and never above the winner's own bid.
    const secondPrice = second ? second.bidCents + 1 : reserve;
    const clearingPriceCents = Math.min(Math.max(secondPrice, reserve), winner.bidCents);

    return {
      filled: true,
      campaignId: winner.campaignId,
      creativeId: winner.creativeId,
      clearingPriceCents,
      competingBids: eligible.length,
    };
  }

  private isEligible(c: AdCandidate, request: AdRequest, reserve: number): boolean {
    if (!Number.isFinite(c.bidCents) || c.bidCents < reserve) return false;
    if (c.remainingBudgetCents < c.bidCents) return false;
    if (!this.targetingMatches(c.targeting, request.context)) return false;
    return true;
  }

  private targetingMatches(
    targeting: AdCandidate['targeting'],
    context: AdRequestContext | undefined,
  ): boolean {
    if (!targeting) return true;
    // Interest targeting: if specified, the viewer must share at least one interest.
    if (targeting.interests && targeting.interests.length > 0) {
      const viewer = new Set(context?.interests ?? []);
      if (!targeting.interests.some((i) => viewer.has(i))) return false;
    }
    // Geo targeting: if specified, the viewer's geo must be in the allow list.
    if (targeting.geo && targeting.geo.length > 0) {
      if (!context?.geo || !targeting.geo.includes(context.geo)) return false;
    }
    return true;
  }

  /**
   * Map live Campaign rows into auction candidates. `budget`/`targeting` are
   * JSON columns; parse them defensively. A campaign with no creative or a
   * non-positive bid is skipped.
   */
  campaignsToCandidates(campaigns: Array<Record<string, any>>): AdCandidate[] {
    const candidates: AdCandidate[] = [];
    for (const c of campaigns) {
      const budget = (c.budget ?? {}) as Record<string, unknown>;
      const targeting = (c.targeting ?? {}) as Record<string, unknown>;
      const bidCents = Math.round(Number(budget['bidCents'] ?? budget['bid'] ?? 0));
      const totalCents = Math.round(Number(budget['totalCents'] ?? budget['total'] ?? 0));
      const spentCents = Math.round(Number((c.totalSpend ?? 0) as number) * 100);
      const creativeId = String(c.defaultCreativeId ?? c.creativeId ?? c.id);
      if (bidCents <= 0) continue;
      candidates.push({
        campaignId: String(c.id),
        creativeId,
        bidCents,
        remainingBudgetCents: Math.max(totalCents - spentCents, 0),
        targeting: {
          interests: Array.isArray(targeting['interests'])
            ? (targeting['interests'] as string[])
            : undefined,
          geo: Array.isArray(targeting['geo']) ? (targeting['geo'] as string[]) : undefined,
        },
      });
    }
    return candidates;
  }
}
