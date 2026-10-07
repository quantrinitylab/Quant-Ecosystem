import { describe, it, expect } from 'vitest';
import { FeedExplainer, UserContext } from '../feed-explainer.js';
import { AlgorithmType, RankedItem } from '../types.js';

describe('FeedExplainer', () => {
  const explainer = new FeedExplainer();

  function makeRankedItem(overrides: Partial<RankedItem> = {}): RankedItem {
    return {
      id: 'item-1',
      content: 'Test content',
      authorId: 'author-1',
      timestamp: Date.now() - 30 * 60 * 1000, // 30min old
      metadata: {},
      upvotes: 10,
      shares: 5,
      replies: 8,
      replyQuality: 0.6,
      authorReputation: 0.8,
      score: 0.85,
      algorithmUsed: AlgorithmType.AI,
      ...overrides,
    };
  }

  const defaultContext: UserContext = {
    followingIds: [],
    topicAffinities: {},
    recentInteractions: [],
  };

  it('should always return exactly 3 signals', () => {
    const item = makeRankedItem();
    const result = explainer.explain(item, defaultContext);

    expect(result.signals).toHaveLength(3);
    expect(result.itemId).toBe('item-1');
  });

  it('should include followed_author signal when author is followed', () => {
    const item = makeRankedItem({ authorId: 'author-42' });
    const context: UserContext = {
      followingIds: ['author-42'],
      topicAffinities: {},
      recentInteractions: [],
    };

    const result = explainer.explain(item, context);

    const followedSignal = result.signals.find((s) => s.signal === 'followed_author');
    expect(followedSignal).toBeDefined();
    expect(followedSignal!.contribution).toBe(0.4);
    expect(followedSignal!.humanReadable).toBe('Posted by someone you follow');
  });

  it('should include topic_affinity signal when topic matches', () => {
    const item = makeRankedItem({ metadata: { topic: 'technology' } });
    const context: UserContext = {
      followingIds: [],
      topicAffinities: { technology: 0.9 },
      recentInteractions: [],
    };

    const result = explainer.explain(item, context);

    const topicSignal = result.signals.find((s) => s.signal === 'topic_affinity');
    expect(topicSignal).toBeDefined();
    expect(topicSignal!.contribution).toBeCloseTo(0.27);
    expect(topicSignal!.humanReadable).toBe('Matches your interest in technology');
  });

  it('should order signals by contribution descending', () => {
    const item = makeRankedItem({
      authorId: 'author-1',
      metadata: { topic: 'sports' },
      replies: 50,
      shares: 60,
      replyQuality: 0.9,
      timestamp: Date.now() - 30 * 60 * 1000,
    });
    const context: UserContext = {
      followingIds: ['author-1'],
      topicAffinities: { sports: 0.8 },
      recentInteractions: [],
    };

    const result = explainer.explain(item, context);

    for (let i = 1; i < result.signals.length; i++) {
      expect(result.signals[i - 1]!.contribution).toBeGreaterThanOrEqual(
        result.signals[i]!.contribution,
      );
    }
  });

  it('should include community_trending for highly engaged content', () => {
    const item = makeRankedItem({ replies: 50, shares: 60 });
    const result = explainer.explain(item, defaultContext);

    const trendingSignal = result.signals.find((s) => s.signal === 'community_trending');
    expect(trendingSignal).toBeDefined();
    expect(trendingSignal!.humanReadable).toBe('Trending in your community');
  });

  it('should include quality_boost for high reply quality', () => {
    const item = makeRankedItem({ replyQuality: 0.9, replies: 50, shares: 60 });
    const context: UserContext = {
      followingIds: ['author-1'],
      topicAffinities: {},
      recentInteractions: [],
    };

    const result = explainer.explain(item, context);

    const qualitySignal = result.signals.find((s) => s.signal === 'quality_boost');
    expect(qualitySignal).toBeDefined();
    expect(qualitySignal!.contribution).toBe(0.2);
    expect(qualitySignal!.humanReadable).toBe('High quality discussion');
  });

  it('should include freshness signal for very recent items', () => {
    const item = makeRankedItem({ timestamp: Date.now() - 10 * 60 * 1000 }); // 10min old
    const result = explainer.explain(item, defaultContext);

    const freshnessSignal = result.signals.find((s) => s.signal === 'freshness');
    expect(freshnessSignal).toBeDefined();
    expect(freshnessSignal!.contribution).toBe(0.15);
    expect(freshnessSignal!.humanReadable).toBe('Just posted');
  });

  it('should pad with general_relevance when fewer than 3 signals match', () => {
    const item = makeRankedItem({
      timestamp: Date.now() - 24 * 60 * 60 * 1000, // old
      replies: 1,
      shares: 0,
      replyQuality: 0.3,
    });
    const result = explainer.explain(item, defaultContext);

    expect(result.signals).toHaveLength(3);
    const generalSignals = result.signals.filter((s) => s.signal === 'general_relevance');
    expect(generalSignals.length).toBeGreaterThan(0);
  });

  it('should handle different combinations of signals', () => {
    const item = makeRankedItem({
      authorId: 'author-5',
      metadata: { topic: 'music' },
      timestamp: Date.now() - 5 * 60 * 1000,
      replyQuality: 0.85,
      replies: 20,
      shares: 30,
    });
    const context: UserContext = {
      followingIds: ['author-5'],
      topicAffinities: { music: 0.7 },
      recentInteractions: ['author-5-post'],
    };

    const result = explainer.explain(item, context);

    expect(result.signals).toHaveLength(3);
    // Top signal should be followed_author (0.4)
    expect(result.signals[0]!.signal).toBe('followed_author');
  });
});
