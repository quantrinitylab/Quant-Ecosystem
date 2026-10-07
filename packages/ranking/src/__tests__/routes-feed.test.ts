import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { AlgorithmType } from '../types.js';
import type { FeedItem } from '../types.js';
import { AlgorithmRegistry } from '../algorithm-registry.js';
import { ChronoRanker } from '../chrono-ranker.js';
import { UserPreferenceService } from '../user-preference.service.js';
import { AntiRageFilter } from '../anti-rage-integration.js';
import { FeedService } from '../feed-service.js';
import feedRoutes from '../routes/feed.js';

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

function createDeps() {
  const registry = new AlgorithmRegistry();
  registry.register(new ChronoRanker());
  const preferenceService = new UserPreferenceService();
  const antiRageFilter = new AntiRageFilter();
  const items = [makeFeedItem({ id: '1' }), makeFeedItem({ id: '2' })];
  const feedService = new FeedService(registry, preferenceService, antiRageFilter, () => items);
  return { feedService, preferenceService };
}

const switchAlgorithmSchema = z.object({
  feedId: z.string().min(1),
  algorithm: z.nativeEnum(AlgorithmType),
  customPluginId: z.string().optional(),
});

describe('feedRoutes', () => {
  it('exports a function that returns a fastify plugin', () => {
    const deps = createDeps();
    const plugin = feedRoutes(deps);
    expect(typeof plugin).toBe('function');
  });

  it('feed service returns ranked items when called directly', () => {
    const deps = createDeps();

    const response = deps.feedService.getFeed({
      userId: 'user1',
      feedId: 'main',
      page: 1,
      pageSize: 10,
    });

    expect(response.items).toHaveLength(2);
    expect(response.algorithmUsed).toBe(AlgorithmType.Chrono);
  });

  it('validates algorithm switch via preference service', () => {
    const deps = createDeps();

    deps.preferenceService.setPreference('user1', 'main', AlgorithmType.AI);
    const pref = deps.preferenceService.getPreference('user1', 'main');

    expect(pref.algorithm).toBe(AlgorithmType.AI);
    expect(pref.userId).toBe('user1');
    expect(pref.feedId).toBe('main');
  });

  it('rejects invalid algorithm type via zod schema', () => {
    const result = switchAlgorithmSchema.safeParse({
      feedId: 'main',
      algorithm: 'invalid_algorithm',
    });

    expect(result.success).toBe(false);
  });

  it('accepts valid algorithm types via zod schema', () => {
    const result = switchAlgorithmSchema.safeParse({
      feedId: 'main',
      algorithm: 'community',
    });

    expect(result.success).toBe(true);
  });
});
