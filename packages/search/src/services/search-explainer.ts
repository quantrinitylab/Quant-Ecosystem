// ============================================================================
// Search Explainer - "Why am I seeing this?" ranking signal explanation
// ============================================================================

import type { HybridSearchResult } from './hybrid-search';

/** A single ranking signal contribution */
export interface RankingSignal {
  signal: string;
  contribution: number;
  humanReadable: string;
}

/** Explanation for a single search result */
export interface ExplanationResult {
  itemId: string;
  topSignals: RankingSignal[];
}

/** Context for generating explanations */
export interface ExplainContext {
  query: string;
  userTopics?: string[];
  userFollowing?: string[];
  trendingTopics?: string[];
}

/**
 * SearchExplainer - Produces human-readable explanations of ranking signals
 *
 * For each search result, computes which signals contributed most to its rank
 * and returns the top 3 with human-readable descriptions.
 */
export class SearchExplainer {
  explain(item: HybridSearchResult, context: ExplainContext): ExplanationResult {
    const signals: RankingSignal[] = [];

    // BM25 keyword match signal
    if (item.bm25Score > 0) {
      signals.push({
        signal: 'keyword_match',
        contribution: item.bm25Score,
        humanReadable: `Matches your search for '${context.query}'`,
      });
    }

    // Vector semantic similarity signal
    if (item.vectorScore > 0) {
      signals.push({
        signal: 'semantic_similarity',
        contribution: item.vectorScore,
        humanReadable: 'Similar to content you liked',
      });
    }

    // Reranker relevance signal (stored in document metadata if available)
    const rerankerScore = item.document?.rerankerScore as number | undefined;
    if (rerankerScore != null && rerankerScore > 0) {
      signals.push({
        signal: 'reranker_relevance',
        contribution: rerankerScore,
        humanReadable: 'Highly relevant to your query',
      });
    }

    // Freshness signal based on document timestamp
    const timestamp = item.document?.publishedAt ?? item.document?.createdAt;
    if (typeof timestamp === 'number') {
      const ageHours = (Date.now() - timestamp) / (1000 * 60 * 60);
      // Fresher content gets a higher freshness contribution (decay over 72 hours)
      const freshness = Math.max(0, 1 - ageHours / 72);
      if (freshness > 0) {
        signals.push({
          signal: 'freshness',
          contribution: freshness,
          humanReadable: 'Recently published',
        });
      }
    }

    // Social signal - if author is in user's following list
    const author = item.document?.userId ?? item.document?.authorId;
    if (
      typeof author === 'string' &&
      context.userFollowing &&
      context.userFollowing.includes(author)
    ) {
      signals.push({
        signal: 'social_signal',
        contribution: 0.8,
        humanReadable: 'Posted by someone you follow',
      });
    }

    // Trending signal - if document topic/tag is in trending topics
    const tags = item.document?.tags ?? item.document?.hashtags;
    if (Array.isArray(tags) && context.trendingTopics && context.trendingTopics.length > 0) {
      const matchingTrend = (tags as string[]).find((tag: string) =>
        context.trendingTopics!.some((topic) => topic.toLowerCase() === tag.toLowerCase()),
      );
      if (matchingTrend) {
        signals.push({
          signal: 'trending',
          contribution: 0.7,
          humanReadable: `Trending in ${matchingTrend}`,
        });
      }
    }

    // Sort by contribution descending and take top 3
    signals.sort((a, b) => b.contribution - a.contribution);
    const topSignals = signals.slice(0, 3);

    return {
      itemId: item.id,
      topSignals,
    };
  }
}
