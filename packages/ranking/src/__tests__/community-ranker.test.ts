import { describe, it, expect } from 'vitest';
import { CommunityRanker } from '../community-ranker.js';
import { AlgorithmType } from '../types.js';
import type { FeedItem } from '../types.js';

function makeFeedItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: '1',
    content: 'Test content',
    authorId: 'author1',
    timestamp: Date.now(),
    metadata: {},
    upvotes: 10,
    shares: 5,
    replies: 3,
    replyQuality: 0.7,
    authorReputation: 0.8,
    ...overrides,
  };
}

describe('CommunityRanker', () => {
  it('ranks higher-engagement items above lower ones', () => {
    const ranker = new CommunityRanker();

    const items: FeedItem[] = [
      makeFeedItem({ id: 'low', upvotes: 1, shares: 0, replyQuality: 0.1, authorReputation: 0.3 }),
      makeFeedItem({
        id: 'high',
        upvotes: 100,
        shares: 50,
        replyQuality: 0.9,
        authorReputation: 0.95,
      }),
    ];

    const result = ranker.rank(items, 'user1');

    expect(result[0]!.id).toBe('high');
    expect(result[0]!.score).toBeGreaterThan(result[1]!.score);
  });

  it('weights author reputation as a multiplier', () => {
    const ranker = new CommunityRanker();

    const items: FeedItem[] = [
      makeFeedItem({
        id: 'low_rep',
        upvotes: 50,
        shares: 25,
        replyQuality: 0.5,
        authorReputation: 0.1,
      }),
      makeFeedItem({
        id: 'high_rep',
        upvotes: 50,
        shares: 25,
        replyQuality: 0.5,
        authorReputation: 1.0,
      }),
    ];

    const result = ranker.rank(items, 'user1');

    // Same engagement but higher reputation should rank higher
    expect(result[0]!.id).toBe('high_rep');
  });

  it('handles empty arrays', () => {
    const ranker = new CommunityRanker();
    const result = ranker.rank([], 'user1');

    expect(result).toEqual([]);
  });

  it('marks items with community algorithm type', () => {
    const ranker = new CommunityRanker();
    const items: FeedItem[] = [makeFeedItem({ id: '1' })];

    const result = ranker.rank(items, 'user1');

    expect(result[0]!.algorithmUsed).toBe(AlgorithmType.Community);
  });
});
