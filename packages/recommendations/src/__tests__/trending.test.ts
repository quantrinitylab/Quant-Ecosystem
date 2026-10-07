import { describe, it, expect } from 'vitest';
import { TrendingRetrieval } from '../retrieval/trending';

describe('TrendingRetrieval', () => {
  it('should record interactions and compute scores', () => {
    const trending = new TrendingRetrieval({ decayHalfLifeMs: 3600000 });
    const now = Date.now();

    trending.recordInteraction('item1', now, 'click');
    trending.recordInteraction('item1', now, 'like');

    const score = trending.getScore('item1', now);
    expect(score).toBeGreaterThan(0);
  });

  it('should apply time decay to scores', () => {
    const halfLife = 3600000; // 1 hour
    const trending = new TrendingRetrieval({ decayHalfLifeMs: halfLife });
    const now = Date.now();

    trending.recordInteraction('item1', now - halfLife, 'click'); // 1 half-life ago
    trending.recordInteraction('item2', now, 'click'); // just now

    const score1 = trending.getScore('item1', now);
    const score2 = trending.getScore('item2', now);

    // Recent interaction should score higher
    expect(score2).toBeGreaterThan(score1);
    // After one half-life, score should be ~half
    expect(score1).toBeCloseTo(score2 * 0.5, 1);
  });

  it('should weight different interaction types differently', () => {
    const trending = new TrendingRetrieval();
    const now = Date.now();

    trending.recordInteraction('item1', now, 'view'); // weight 1
    trending.recordInteraction('item2', now, 'purchase'); // weight 10

    const scoreView = trending.getScore('item1', now);
    const scorePurchase = trending.getScore('item2', now);

    expect(scorePurchase).toBeGreaterThan(scoreView);
  });

  it('should return trending items sorted by score', () => {
    const trending = new TrendingRetrieval();
    const now = Date.now();

    trending.recordInteraction('item1', now, 'click');
    trending.recordInteraction('item2', now, 'share');
    trending.recordInteraction('item2', now, 'like');
    trending.recordInteraction('item3', now, 'purchase');

    const topItems = trending.getTrending(2, 86400000, now);
    expect(topItems).toHaveLength(2);
    expect(topItems[0]!.score).toBeGreaterThanOrEqual(topItems[1]!.score);
  });

  it('should exclude items outside time window', () => {
    const trending = new TrendingRetrieval();
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const twoDaysAgo = now - 2 * 86400000;

    trending.recordInteraction('recent', oneHourAgo, 'click');
    trending.recordInteraction('old', twoDaysAgo, 'click');

    const topItems = trending.getTrending(10, 86400000, now); // 24h window
    const itemIds = topItems.map((t) => t.itemId);

    expect(itemIds).toContain('recent');
    expect(itemIds).not.toContain('old');
  });

  it('should return 0 score for unknown item', () => {
    const trending = new TrendingRetrieval();
    expect(trending.getScore('unknown')).toBe(0);
  });

  it('should track item count', () => {
    const trending = new TrendingRetrieval();
    const now = Date.now();

    trending.recordInteraction('item1', now, 'click');
    trending.recordInteraction('item2', now, 'click');
    expect(trending.getItemCount()).toBe(2);
  });
});
