// ============================================================================
// QuantChat - Spotlight Service (Tasks 13.5, 13.6, 13.7, 13.8)
//
// Computes the curated Spotlight feed:
//   - computeEngagementScore()  weighted engagement metric per reel (13.5)
//   - rankBySpotlight()         pure engagement ranking + "Featured" flag (13.7)
//   - SpotlightService          caches the global ranking and refreshes it at
//                               most every 15 minutes (13.6)
//   - applyPersonalization()    optional @quant/recommendations reorder (13.8)
//                               with graceful fallback to engagement-only.
//
// The expensive global engagement ranking is cached (15-minute TTL). Per-user
// personalization is applied cheaply on top of the cached ranking per request,
// so the "Featured" set stays globally consistent while ordering can be tuned
// to the viewer.
// ============================================================================

/** Source reel shape consumed by the ranker (matches the reels feed model). */
export interface SpotlightSourceReel {
  id: string;
  creatorId: string;
  creatorUsername: string;
  creatorAvatar: string;
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  duration: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  watchThroughRate: number;
  createdAt: string;
  isLikedByUser: boolean;
}

export interface RankedSpotlightReel extends SpotlightSourceReel {
  /** Weighted engagement score used for ordering. */
  engagementScore: number;
  /** True for the top-ranked reels surfaced as "Featured" (Task 13.7). */
  isFeatured: boolean;
}

export interface SpotlightFeed {
  reels: RankedSpotlightReel[];
  /** Epoch ms at which the cached ranking was last (re)computed. */
  rankedAt: number;
  /** True when this call recomputed the ranking (cache miss/expired). */
  refreshed: boolean;
}

// Engagement weights. Shares are the strongest virality signal, then comments,
// then likes. Watch-through-rate (0..1) is scaled so a fully-watched reel
// contributes a meaningful, like-comparable amount.
export const ENGAGEMENT_WEIGHTS = {
  like: 1,
  comment: 2,
  share: 3,
  watchThrough: 1000,
} as const;

/** Number of top reels flagged as "Featured". */
export const FEATURED_COUNT = 3;

/** Spotlight ranking cache TTL — refresh at most every 15 minutes (Task 13.6). */
export const SPOTLIGHT_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Weighted engagement score for a single reel (Task 13.5).
 * Pure and deterministic — exported for unit testing.
 */
export function computeEngagementScore(reel: SpotlightSourceReel): number {
  const watch = Math.max(0, Math.min(1, reel.watchThroughRate));
  return (
    reel.likeCount * ENGAGEMENT_WEIGHTS.like +
    reel.commentCount * ENGAGEMENT_WEIGHTS.comment +
    reel.shareCount * ENGAGEMENT_WEIGHTS.share +
    watch * ENGAGEMENT_WEIGHTS.watchThrough
  );
}

/**
 * Pure engagement ranking (descending) with the top {@link FEATURED_COUNT}
 * reels flagged as featured. Ties broken by id for deterministic ordering.
 */
export function rankBySpotlight(reels: SpotlightSourceReel[]): RankedSpotlightReel[] {
  return reels
    .map((reel) => ({ ...reel, engagementScore: computeEngagementScore(reel), isFeatured: false }))
    .sort((a, b) => {
      if (b.engagementScore !== a.engagementScore) return b.engagementScore - a.engagementScore;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .map((reel, index) => ({ ...reel, isFeatured: index < FEATURED_COUNT }));
}

// ---------------------------------------------------------------------------
// Personalization via @quant/recommendations (Task 13.8) — optional dependency.
// ---------------------------------------------------------------------------

/** Minimal structural surface of the recommendation engine we rely on. */
interface RecommendationEngineLike {
  addContent(content: {
    id: string;
    type: string;
    title: string;
    creatorId: string;
    createdAt: Date;
    tags?: string[];
  }): Promise<void>;
  recommendForUser(userId: string, limit?: number): Promise<Array<{ id: string }>>;
}

/**
 * Attempt to load `@quant/recommendations` at runtime. Returns `null` when the
 * package is not installed/available so callers fall back to engagement-only
 * ranking. The module specifier is typed as `string` so the optional dependency
 * does not become a hard compile-time requirement.
 */
export async function loadRecommendationEngine(): Promise<RecommendationEngineLike | null> {
  try {
    const moduleName: string = '@quant/recommendations';
    const mod = (await import(moduleName)) as {
      RecommendationEngine?: new () => RecommendationEngineLike;
    };
    if (mod && typeof mod.RecommendationEngine === 'function') {
      return new mod.RecommendationEngine();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Reorder an engagement-ranked feed to personalize it for a viewer using
 * `@quant/recommendations` (Task 13.8). Reels the engine surfaces are moved to
 * the front (in the engine's order); all remaining reels keep their engagement
 * order. The `isFeatured` flags are preserved unchanged (Featured is global).
 *
 * If the package is unavailable or yields no signal, the input ordering is
 * returned unchanged (engagement-only fallback).
 */
export async function applyPersonalization(
  userId: string,
  ranked: RankedSpotlightReel[],
): Promise<RankedSpotlightReel[]> {
  const engine = await loadRecommendationEngine();
  if (!engine) return ranked;

  try {
    for (const reel of ranked) {
      await engine.addContent({
        id: reel.id,
        type: 'video',
        title: reel.caption,
        creatorId: reel.creatorId,
        createdAt: new Date(reel.createdAt),
        tags: reel.caption.split(/\s+/).filter((t) => t.startsWith('#')),
      });
    }

    const recommended = await engine.recommendForUser(userId, ranked.length);
    if (!recommended || recommended.length === 0) return ranked;

    const byId = new Map(ranked.map((r) => [r.id, r]));
    const ordered: RankedSpotlightReel[] = [];
    const seen = new Set<string>();

    for (const rec of recommended) {
      const reel = byId.get(rec.id);
      if (reel && !seen.has(reel.id)) {
        ordered.push(reel);
        seen.add(reel.id);
      }
    }
    for (const reel of ranked) {
      if (!seen.has(reel.id)) ordered.push(reel);
    }
    return ordered;
  } catch {
    // Any failure in the optional personalization path degrades gracefully.
    return ranked;
  }
}

/**
 * Stateful Spotlight ranking with a 15-minute cache (Task 13.6). The cached
 * value is the global engagement ranking; personalization is layered per
 * request by the route.
 */
export class SpotlightService {
  private cache: { rankedAt: number; reels: RankedSpotlightReel[] } | null = null;

  constructor(private readonly refreshIntervalMs: number = SPOTLIGHT_REFRESH_INTERVAL_MS) {}

  /** True when a cached ranking exists and is still within the refresh window. */
  isCacheFresh(now: number = Date.now()): boolean {
    return this.cache !== null && now - this.cache.rankedAt < this.refreshIntervalMs;
  }

  /**
   * Return the engagement ranking, recomputing only when the cache is missing,
   * expired, or `forceRefresh` is set. `refreshed` indicates a recompute, which
   * the route uses to gate "Featured" push notifications (Task 13.7).
   */
  getEngagementRanking(
    reels: SpotlightSourceReel[],
    opts: { now?: number; forceRefresh?: boolean } = {},
  ): SpotlightFeed {
    const now = opts.now ?? Date.now();

    if (!opts.forceRefresh && this.isCacheFresh(now) && this.cache) {
      return { reels: this.cache.reels, rankedAt: this.cache.rankedAt, refreshed: false };
    }

    const ranked = rankBySpotlight(reels);
    this.cache = { rankedAt: now, reels: ranked };
    return { reels: ranked, rankedAt: now, refreshed: true };
  }

  /** Featured reels from the current/last ranking (top {@link FEATURED_COUNT}). */
  getFeatured(): RankedSpotlightReel[] {
    return this.cache?.reels.filter((r) => r.isFeatured) ?? [];
  }
}
