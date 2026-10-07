// ============================================================================
// Search Explainer - Tests
// ============================================================================

import { describe, it, expect } from 'vitest';
import { SearchExplainer } from '../services/search-explainer';
import type { HybridSearchResult } from '../services/hybrid-search';
import type { ExplainContext } from '../services/search-explainer';

describe('SearchExplainer', () => {
  const explainer = new SearchExplainer();

  const baseContext: ExplainContext = {
    query: 'machine learning',
    userTopics: ['technology', 'ai'],
    userFollowing: ['user-123', 'user-456'],
    trendingTopics: ['Technology', 'AI'],
  };

  describe('signal computation', () => {
    it('should compute keyword_match signal from bm25Score', () => {
      const item: HybridSearchResult = {
        id: 'doc-1',
        score: 0.8,
        bm25Score: 0.9,
        vectorScore: 0,
        document: {},
      };

      const result = explainer.explain(item, baseContext);
      const keywordSignal = result.topSignals.find((s) => s.signal === 'keyword_match');
      expect(keywordSignal).toBeDefined();
      expect(keywordSignal!.contribution).toBe(0.9);
      expect(keywordSignal!.humanReadable).toBe("Matches your search for 'machine learning'");
    });

    it('should compute semantic_similarity signal from vectorScore', () => {
      const item: HybridSearchResult = {
        id: 'doc-2',
        score: 0.7,
        bm25Score: 0,
        vectorScore: 0.85,
        document: {},
      };

      const result = explainer.explain(item, baseContext);
      const vectorSignal = result.topSignals.find((s) => s.signal === 'semantic_similarity');
      expect(vectorSignal).toBeDefined();
      expect(vectorSignal!.contribution).toBe(0.85);
      expect(vectorSignal!.humanReadable).toBe('Similar to content you liked');
    });

    it('should compute reranker_relevance signal from document.rerankerScore', () => {
      const item: HybridSearchResult = {
        id: 'doc-3',
        score: 0.9,
        bm25Score: 0.5,
        vectorScore: 0.6,
        document: { rerankerScore: 0.95 },
      };

      const result = explainer.explain(item, baseContext);
      const rerankerSignal = result.topSignals.find((s) => s.signal === 'reranker_relevance');
      expect(rerankerSignal).toBeDefined();
      expect(rerankerSignal!.contribution).toBe(0.95);
      expect(rerankerSignal!.humanReadable).toBe('Highly relevant to your query');
    });

    it('should compute freshness signal from document timestamp', () => {
      const oneHourAgo = Date.now() - 1000 * 60 * 60;
      const item: HybridSearchResult = {
        id: 'doc-4',
        score: 0.5,
        bm25Score: 0.3,
        vectorScore: 0.2,
        document: { publishedAt: oneHourAgo },
      };

      const result = explainer.explain(item, baseContext);
      const freshnessSignal = result.topSignals.find((s) => s.signal === 'freshness');
      expect(freshnessSignal).toBeDefined();
      expect(freshnessSignal!.contribution).toBeGreaterThan(0.9);
      expect(freshnessSignal!.humanReadable).toBe('Recently published');
    });

    it('should compute social_signal when author is in following', () => {
      const item: HybridSearchResult = {
        id: 'doc-5',
        score: 0.5,
        bm25Score: 0.3,
        vectorScore: 0.2,
        document: { userId: 'user-123' },
      };

      const result = explainer.explain(item, baseContext);
      const socialSignal = result.topSignals.find((s) => s.signal === 'social_signal');
      expect(socialSignal).toBeDefined();
      expect(socialSignal!.contribution).toBe(0.8);
      expect(socialSignal!.humanReadable).toBe('Posted by someone you follow');
    });

    it('should compute trending signal when tags match trending topics', () => {
      const item: HybridSearchResult = {
        id: 'doc-6',
        score: 0.5,
        bm25Score: 0.3,
        vectorScore: 0.2,
        document: { tags: ['Technology', 'Science'] },
      };

      const result = explainer.explain(item, baseContext);
      const trendingSignal = result.topSignals.find((s) => s.signal === 'trending');
      expect(trendingSignal).toBeDefined();
      expect(trendingSignal!.contribution).toBe(0.7);
      expect(trendingSignal!.humanReadable).toBe('Trending in Technology');
    });
  });

  describe('top-3 selection', () => {
    it('should return at most 3 signals', () => {
      const oneHourAgo = Date.now() - 1000 * 60 * 60;
      const item: HybridSearchResult = {
        id: 'doc-all',
        score: 0.9,
        bm25Score: 0.8,
        vectorScore: 0.7,
        document: {
          rerankerScore: 0.95,
          publishedAt: oneHourAgo,
          userId: 'user-123',
          tags: ['Technology'],
        },
      };

      const result = explainer.explain(item, baseContext);
      expect(result.topSignals).toHaveLength(3);
    });

    it('should select top 3 by contribution value', () => {
      const item: HybridSearchResult = {
        id: 'doc-sorted',
        score: 0.9,
        bm25Score: 0.4,
        vectorScore: 0.6,
        document: {
          rerankerScore: 0.95,
          userId: 'user-123',
        },
      };

      const result = explainer.explain(item, baseContext);
      expect(result.topSignals).toHaveLength(3);
      // reranker (0.95) > social (0.8) > semantic (0.6)
      expect(result.topSignals[0]!.signal).toBe('reranker_relevance');
      expect(result.topSignals[1]!.signal).toBe('social_signal');
      expect(result.topSignals[2]!.signal).toBe('semantic_similarity');
    });

    it('should return fewer than 3 if not enough signals', () => {
      const item: HybridSearchResult = {
        id: 'doc-few',
        score: 0.5,
        bm25Score: 0,
        vectorScore: 0.5,
        document: {},
      };

      const result = explainer.explain(item, { query: 'test' });
      expect(result.topSignals).toHaveLength(1);
      expect(result.topSignals[0]!.signal).toBe('semantic_similarity');
    });
  });

  describe('different signal combinations', () => {
    it('should handle item with only BM25 score', () => {
      const item: HybridSearchResult = {
        id: 'doc-bm25',
        score: 0.7,
        bm25Score: 0.7,
        vectorScore: 0,
        document: {},
      };

      const result = explainer.explain(item, { query: 'hello' });
      expect(result.topSignals).toHaveLength(1);
      expect(result.topSignals[0]!.signal).toBe('keyword_match');
    });

    it('should handle item with no scores', () => {
      const item: HybridSearchResult = {
        id: 'doc-empty',
        score: 0,
        bm25Score: 0,
        vectorScore: 0,
        document: {},
      };

      const result = explainer.explain(item, { query: 'test' });
      expect(result.topSignals).toHaveLength(0);
    });

    it('should handle createdAt timestamp for freshness', () => {
      const tenMinutesAgo = Date.now() - 1000 * 60 * 10;
      const item: HybridSearchResult = {
        id: 'doc-fresh',
        score: 0.5,
        bm25Score: 0.5,
        vectorScore: 0,
        document: { createdAt: tenMinutesAgo },
      };

      const result = explainer.explain(item, { query: 'test' });
      const freshnessSignal = result.topSignals.find((s) => s.signal === 'freshness');
      expect(freshnessSignal).toBeDefined();
      expect(freshnessSignal!.contribution).toBeGreaterThan(0.95);
    });

    it('should match trending topics case-insensitively', () => {
      const item: HybridSearchResult = {
        id: 'doc-trend',
        score: 0.5,
        bm25Score: 0.3,
        vectorScore: 0,
        document: { hashtags: ['technology'] },
      };

      const result = explainer.explain(item, {
        query: 'test',
        trendingTopics: ['Technology'],
      });
      const trendingSignal = result.topSignals.find((s) => s.signal === 'trending');
      expect(trendingSignal).toBeDefined();
    });

    it('should use authorId field for social signal', () => {
      const item: HybridSearchResult = {
        id: 'doc-author',
        score: 0.5,
        bm25Score: 0.3,
        vectorScore: 0,
        document: { authorId: 'user-456' },
      };

      const result = explainer.explain(item, {
        query: 'test',
        userFollowing: ['user-456'],
      });
      const socialSignal = result.topSignals.find((s) => s.signal === 'social_signal');
      expect(socialSignal).toBeDefined();
    });
  });

  describe('humanReadable text generation', () => {
    it('should include query text in keyword match explanation', () => {
      const item: HybridSearchResult = {
        id: 'doc-1',
        score: 0.8,
        bm25Score: 0.8,
        vectorScore: 0,
        document: {},
      };

      const result = explainer.explain(item, { query: 'TypeScript tutorial' });
      expect(result.topSignals[0]!.humanReadable).toBe(
        "Matches your search for 'TypeScript tutorial'",
      );
    });

    it('should include topic name in trending explanation', () => {
      const item: HybridSearchResult = {
        id: 'doc-1',
        score: 0.5,
        bm25Score: 0.3,
        vectorScore: 0,
        document: { tags: ['Rust'] },
      };

      const result = explainer.explain(item, {
        query: 'test',
        trendingTopics: ['Rust'],
      });
      const trendingSignal = result.topSignals.find((s) => s.signal === 'trending');
      expect(trendingSignal!.humanReadable).toBe('Trending in Rust');
    });
  });
});
