import { describe, it, expect } from 'vitest';
import { ChronoRanker } from '../chrono-ranker.js';
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

describe('ChronoRanker', () => {
  it('ranks items by timestamp descending', () => {
    const ranker = new ChronoRanker();
    const items: FeedItem[] = [
      makeFeedItem({ id: '1', timestamp: 1000 }),
      makeFeedItem({ id: '2', timestamp: 3000 }),
      makeFeedItem({ id: '3', timestamp: 2000 }),
    ];

    const result = ranker.rank(items, 'user1');

    expect(result[0]!.id).toBe('2');
    expect(result[1]!.id).toBe('3');
    expect(result[2]!.id).toBe('1');
  });

  it('handles empty arrays', () => {
    const ranker = new ChronoRanker();
    const result = ranker.rank([], 'user1');

    expect(result).toEqual([]);
  });

  it('handles items with same timestamp', () => {
    const ranker = new ChronoRanker();
    const items: FeedItem[] = [
      makeFeedItem({ id: '1', timestamp: 1000 }),
      makeFeedItem({ id: '2', timestamp: 1000 }),
    ];

    const result = ranker.rank(items, 'user1');

    expect(result).toHaveLength(2);
    expect(result.every((item) => item.algorithmUsed === AlgorithmType.Chrono)).toBe(true);
  });

  it('assigns decreasing scores', () => {
    const ranker = new ChronoRanker();
    const items: FeedItem[] = [
      makeFeedItem({ id: '1', timestamp: 3000 }),
      makeFeedItem({ id: '2', timestamp: 2000 }),
      makeFeedItem({ id: '3', timestamp: 1000 }),
    ];

    const result = ranker.rank(items, 'user1');

    expect(result[0]!.score).toBeGreaterThan(result[1]!.score);
    expect(result[1]!.score).toBeGreaterThan(result[2]!.score);
  });
});
