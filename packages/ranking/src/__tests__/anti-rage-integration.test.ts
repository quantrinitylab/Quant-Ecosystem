import { describe, it, expect } from 'vitest';
import { AntiRageFilter } from '../anti-rage-integration.js';
import { AlgorithmType } from '../types.js';
import type { RankedItem } from '../types.js';

function makeRankedItem(overrides: Partial<RankedItem> = {}): RankedItem {
  return {
    id: '1',
    content: 'Normal quality content about programming',
    authorId: 'author1',
    timestamp: Date.now(),
    metadata: {},
    upvotes: 10,
    shares: 5,
    replies: 3,
    replyQuality: 0.7,
    authorReputation: 0.8,
    score: 0.8,
    algorithmUsed: AlgorithmType.Chrono,
    ...overrides,
  };
}

describe('AntiRageFilter', () => {
  it('reduces score of rage-bait content', () => {
    const filter = new AntiRageFilter();

    const rageBait = makeRankedItem({
      id: 'rage',
      content: 'OUTRAGEOUS!! This is DISGUSTING and APPALLING behavior!! SHOCKING!!',
      metadata: { quoteRetweetRatio: 0.8, angryReplyRatio: 0.6 },
      replyQuality: 0.1,
      score: 0.9,
    });

    const result = filter.applyFilter([rageBait]);

    expect(result[0]!.score).toBeLessThan(0.9);
  });

  it('preserves or boosts quality content', () => {
    const filter = new AntiRageFilter();

    const qualityItem = makeRankedItem({
      id: 'quality',
      content: 'A thoughtful analysis of distributed systems architecture',
      metadata: { quoteRetweetRatio: 0.1, angryReplyRatio: 0.02, replyLengthAvg: 200 },
      replyQuality: 0.9,
      score: 0.8,
    });

    const result = filter.applyFilter([qualityItem]);

    // Quality content should get boosted or at least not heavily penalized
    expect(result[0]!.score).toBeGreaterThanOrEqual(0.75);
  });

  it('works with all algorithm outputs', () => {
    const filter = new AntiRageFilter();

    const items: RankedItem[] = [
      makeRankedItem({ id: '1', algorithmUsed: AlgorithmType.Chrono, score: 0.9 }),
      makeRankedItem({ id: '2', algorithmUsed: AlgorithmType.AI, score: 0.8 }),
      makeRankedItem({ id: '3', algorithmUsed: AlgorithmType.Community, score: 0.7 }),
    ];

    const result = filter.applyFilter(items);

    expect(result).toHaveLength(3);
    // All items should have adjusted scores
    result.forEach((item) => {
      expect(item.score).toBeGreaterThan(0);
    });
  });

  it('applies penalty proportionally to rage signals', () => {
    const filter = new AntiRageFilter();

    const mildRage = makeRankedItem({
      id: 'mild',
      content: 'This is somewhat shocking news',
      metadata: { quoteRetweetRatio: 0.2, angryReplyRatio: 0.1 },
      score: 0.8,
    });

    const heavyRage = makeRankedItem({
      id: 'heavy',
      content: 'OUTRAGEOUS DISGUSTING SHOCKING APPALLING content that is VILE and DEPLORABLE',
      metadata: { quoteRetweetRatio: 0.9, angryReplyRatio: 0.8 },
      replyQuality: 0.05,
      score: 0.8,
    });

    const mildResults = filter.applyFilter([mildRage]);
    const heavyResults = filter.applyFilter([heavyRage]);

    expect(heavyResults[0]!.score).toBeLessThan(mildResults[0]!.score);
  });
});
