import { describe, it, expect } from 'vitest';
import { FeedService } from '../feed-service.js';
import { AlgorithmRegistry } from '../algorithm-registry.js';
import { ChronoRanker } from '../chrono-ranker.js';
import { AIRanker } from '../ai-ranker.js';
import { CommunityRanker } from '../community-ranker.js';
import { UserPreferenceService } from '../user-preference.service.js';
import { AntiRageFilter } from '../anti-rage-integration.js';
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

function createFeedService(items: FeedItem[]) {
  const registry = new AlgorithmRegistry();
  registry.register(new ChronoRanker());
  registry.register(new AIRanker());
  registry.register(new CommunityRanker());

  const preferenceService = new UserPreferenceService();
  const antiRageFilter = new AntiRageFilter();
  const candidateProvider = () => items;

  return {
    service: new FeedService(registry, preferenceService, antiRageFilter, candidateProvider),
    preferenceService,
  };
}

describe('FeedService', () => {
  it('returns ranked items for default algorithm (chrono)', () => {
    const now = Date.now();
    const items: FeedItem[] = [
      makeFeedItem({ id: '1', timestamp: now - 2000 }),
      makeFeedItem({ id: '2', timestamp: now }),
      makeFeedItem({ id: '3', timestamp: now - 1000 }),
    ];

    const { service } = createFeedService(items);

    const response = service.getFeed({
      userId: 'user1',
      feedId: 'main',
      page: 1,
      pageSize: 10,
    });

    expect(response.items[0]!.id).toBe('2');
    expect(response.algorithmUsed).toBe(AlgorithmType.Chrono);
  });

  it('switching algorithm changes output order', () => {
    const now = Date.now();
    const items: FeedItem[] = [
      makeFeedItem({
        id: '1',
        timestamp: now,
        upvotes: 1,
        shares: 0,
        replyQuality: 0.1,
        authorReputation: 0.1,
      }),
      makeFeedItem({
        id: '2',
        timestamp: now - 5000,
        upvotes: 200,
        shares: 100,
        replyQuality: 0.95,
        authorReputation: 0.99,
      }),
    ];

    const { service, preferenceService } = createFeedService(items);

    // Default chrono: newest first
    const chronoResult = service.getFeed({
      userId: 'user1',
      feedId: 'main',
      page: 1,
      pageSize: 10,
    });
    expect(chronoResult.items[0]!.id).toBe('1');

    // Switch to community ranking: highest engagement first
    preferenceService.setPreference('user1', 'main', AlgorithmType.Community);
    const communityResult = service.getFeed({
      userId: 'user1',
      feedId: 'main',
      page: 1,
      pageSize: 10,
    });
    expect(communityResult.items[0]!.id).toBe('2');
  });

  it('applies anti-rage filter regardless of algorithm', () => {
    const now = Date.now();
    const items: FeedItem[] = [
      makeFeedItem({
        id: 'rage',
        timestamp: now,
        content: 'OUTRAGEOUS!! DISGUSTING!! SHOCKING!! APPALLING!! VILE!!',
        metadata: { quoteRetweetRatio: 0.9, angryReplyRatio: 0.8 },
        replyQuality: 0.05,
        upvotes: 100,
        shares: 50,
      }),
      makeFeedItem({
        id: 'quality',
        timestamp: now - 1000,
        content: 'A thoughtful discussion on system design',
        metadata: { quoteRetweetRatio: 0.05, angryReplyRatio: 0.02, replyLengthAvg: 200 },
        replyQuality: 0.95,
        upvotes: 80,
        shares: 40,
      }),
    ];

    const { service, preferenceService } = createFeedService(items);

    // With chrono, the rage item is newest but should be penalized
    const chronoResult = service.getFeed({
      userId: 'user1',
      feedId: 'main',
      page: 1,
      pageSize: 10,
    });

    // The rage item exists but its score should be reduced
    const rageItem = chronoResult.items.find((i) => i.id === 'rage');
    const qualityItem = chronoResult.items.find((i) => i.id === 'quality');
    expect(rageItem).toBeDefined();
    expect(qualityItem).toBeDefined();

    // With community too
    preferenceService.setPreference('user1', 'main', AlgorithmType.Community);
    const communityResult = service.getFeed({
      userId: 'user1',
      feedId: 'main',
      page: 1,
      pageSize: 10,
    });

    const rageItemCommunity = communityResult.items.find((i) => i.id === 'rage');
    expect(rageItemCommunity).toBeDefined();
    // Rage should have reduced score from anti-rage filter
    expect(rageItemCommunity!.score).toBeLessThan(1);
  });

  it('re-sorts by score after anti-rage filter for non-chrono algorithms', () => {
    const now = Date.now();
    const items: FeedItem[] = [
      makeFeedItem({
        id: 'rage',
        timestamp: now - 5000,
        content: 'OUTRAGEOUS!! DISGUSTING!! SHOCKING!! APPALLING!! VILE!!',
        metadata: { quoteRetweetRatio: 0.9, angryReplyRatio: 0.8 },
        replyQuality: 0.05,
        upvotes: 200,
        shares: 100,
        authorReputation: 0.99,
      }),
      makeFeedItem({
        id: 'quality',
        timestamp: now - 6000,
        content: 'A thoughtful discussion on system design',
        metadata: { quoteRetweetRatio: 0.05, angryReplyRatio: 0.02, replyLengthAvg: 200 },
        replyQuality: 0.95,
        upvotes: 80,
        shares: 40,
        authorReputation: 0.9,
      }),
    ];

    const { service, preferenceService } = createFeedService(items);

    // With community ranking, the rage item would rank first by engagement
    // but after anti-rage filter + re-sort, quality item should be first
    preferenceService.setPreference('user1', 'main', AlgorithmType.Community);
    const communityResult = service.getFeed({
      userId: 'user1',
      feedId: 'main',
      page: 1,
      pageSize: 10,
    });

    expect(communityResult.items[0]!.id).toBe('quality');
    expect(communityResult.items[1]!.id).toBe('rage');
  });

  it('preserves chrono ordering after anti-rage filter (no re-sort)', () => {
    const now = Date.now();
    const items: FeedItem[] = [
      makeFeedItem({
        id: 'rage',
        timestamp: now,
        content: 'OUTRAGEOUS!! DISGUSTING!! SHOCKING!! APPALLING!! VILE!!',
        metadata: { quoteRetweetRatio: 0.9, angryReplyRatio: 0.8 },
        replyQuality: 0.05,
        upvotes: 100,
        shares: 50,
      }),
      makeFeedItem({
        id: 'quality',
        timestamp: now - 1000,
        content: 'A thoughtful discussion on system design',
        metadata: { quoteRetweetRatio: 0.05, angryReplyRatio: 0.02, replyLengthAvg: 200 },
        replyQuality: 0.95,
        upvotes: 80,
        shares: 40,
      }),
    ];

    const { service } = createFeedService(items);

    // With chrono, the rage item is newest and should stay first
    // (chrono does not re-sort after filtering)
    const chronoResult = service.getFeed({
      userId: 'user1',
      feedId: 'main',
      page: 1,
      pageSize: 10,
    });

    expect(chronoResult.items[0]!.id).toBe('rage');
    expect(chronoResult.items[1]!.id).toBe('quality');
  });

  it('paginates results correctly', () => {
    const items: FeedItem[] = Array.from({ length: 20 }, (_, i) =>
      makeFeedItem({ id: `item-${i}`, timestamp: Date.now() - i * 1000 }),
    );

    const { service } = createFeedService(items);

    const page1 = service.getFeed({ userId: 'user1', feedId: 'main', page: 1, pageSize: 5 });
    const page2 = service.getFeed({ userId: 'user1', feedId: 'main', page: 2, pageSize: 5 });

    expect(page1.items).toHaveLength(5);
    expect(page2.items).toHaveLength(5);
    expect(page1.items[0]!.id).not.toBe(page2.items[0]!.id);
  });
});
