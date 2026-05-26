import { describe, it, expect } from 'vitest';
import { AIRanker } from '../ai-ranker.js';
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

describe('AIRanker', () => {
  it('produces different order than purely chronological', () => {
    const ranker = new AIRanker();
    const now = Date.now();

    const items: FeedItem[] = [
      makeFeedItem({ id: '1', timestamp: now - 1000, upvotes: 100, shares: 50, replies: 30 }),
      makeFeedItem({ id: '2', timestamp: now, upvotes: 1, shares: 0, replies: 0 }),
      makeFeedItem({ id: '3', timestamp: now - 2000, upvotes: 200, shares: 100, replies: 50 }),
    ];

    const result = ranker.rank(items, 'user1');

    // High engagement items should rank higher than newest but low engagement
    expect(result[0]!.id).not.toBe('2');
    expect(result.every((item) => item.algorithmUsed === AlgorithmType.AI)).toBe(true);
  });

  it('personalizes ranking based on user profile', () => {
    const ranker = new AIRanker();
    const now = Date.now();

    ranker.setUserProfile('user1', {
      preferredAuthors: ['favorite_author'],
      topicAffinities: { typescript: 0.9 },
      avgSessionLength: 300,
      engagementRate: 0.8,
    });

    const items: FeedItem[] = [
      makeFeedItem({
        id: '1',
        timestamp: now,
        authorId: 'random_author',
        content: 'Python article',
        upvotes: 50,
      }),
      makeFeedItem({
        id: '2',
        timestamp: now,
        authorId: 'favorite_author',
        content: 'TypeScript guide',
        upvotes: 50,
      }),
    ];

    const result = ranker.rank(items, 'user1');

    // Item from preferred author with matching topic should rank higher
    expect(result[0]!.id).toBe('2');
  });

  it('handles empty items array', () => {
    const ranker = new AIRanker();
    const result = ranker.rank([], 'user1');

    expect(result).toEqual([]);
  });

  it('handles user without profile (no personalization)', () => {
    const ranker = new AIRanker();
    const now = Date.now();

    const items: FeedItem[] = [
      makeFeedItem({ id: '1', timestamp: now, upvotes: 10 }),
      makeFeedItem({ id: '2', timestamp: now, upvotes: 20 }),
    ];

    const result = ranker.rank(items, 'unknown_user');

    expect(result).toHaveLength(2);
    expect(result.every((item) => item.algorithmUsed === AlgorithmType.AI)).toBe(true);
  });
});
