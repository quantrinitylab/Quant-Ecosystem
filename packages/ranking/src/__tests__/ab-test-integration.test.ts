import { describe, it, expect } from 'vitest';
import { ABTestIntegration } from '../ab-test-integration.js';
import { FeedService } from '../feed-service.js';
import { AlgorithmRegistry } from '../algorithm-registry.js';
import { ChronoRanker } from '../chrono-ranker.js';
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

describe('ABTestIntegration', () => {
  it('assigns users deterministically to experiment buckets', () => {
    const abTest = new ABTestIntegration();

    abTest.createExperiment({
      experimentId: 'ranking-exp-1',
      name: 'Chrono vs Community',
      controlAlgorithm: AlgorithmType.Chrono,
      treatmentAlgorithms: [AlgorithmType.Community],
    });

    // Same user should always get same bucket
    const bucket1 = abTest.assignUserBucket('user-123', 'ranking-exp-1');
    const bucket2 = abTest.assignUserBucket('user-123', 'ranking-exp-1');

    expect(bucket1.bucket).toBe(bucket2.bucket);
    expect(bucket1.algorithm).toBe(bucket2.algorithm);
  });

  it('assigns different users to different buckets', () => {
    const abTest = new ABTestIntegration();

    abTest.createExperiment({
      experimentId: 'ranking-exp-2',
      name: 'Chrono vs Community',
      controlAlgorithm: AlgorithmType.Chrono,
      treatmentAlgorithms: [AlgorithmType.Community],
    });

    // With enough users, we should get both buckets
    const buckets = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const result = abTest.assignUserBucket(`user-${i}`, 'ranking-exp-2');
      buckets.add(result.bucket);
    }

    expect(buckets.size).toBeGreaterThan(1);
  });

  it('logs exposures for users', () => {
    const abTest = new ABTestIntegration();

    abTest.createExperiment({
      experimentId: 'exp-1',
      name: 'Test',
      controlAlgorithm: AlgorithmType.Chrono,
      treatmentAlgorithms: [AlgorithmType.Community],
    });

    abTest.assignUserBucket('user-1', 'exp-1');
    abTest.assignUserBucket('user-2', 'exp-1');

    const experimentService = abTest.getExperimentService();
    expect(experimentService.getExposureCount('exp-1')).toBe(2);
  });

  it('computes experiment results', () => {
    const abTest = new ABTestIntegration();

    abTest.createExperiment({
      experimentId: 'exp-results',
      name: 'Results Test',
      controlAlgorithm: AlgorithmType.Chrono,
      treatmentAlgorithms: [AlgorithmType.Community],
    });

    // Simulate user assignments and conversions
    for (let i = 0; i < 50; i++) {
      abTest.assignUserBucket(`user-${i}`, 'exp-results');
      if (i % 3 === 0) {
        abTest.logConversion(`user-${i}`, 'exp-results', true);
      }
    }

    const result = abTest.computeResult('exp-results');
    expect(result.experimentId).toBe('exp-results');
    expect(result.bucketStats).toBeDefined();
  });

  it('overrides algorithm for experiments via getFeedWithExperiment', () => {
    const abTest = new ABTestIntegration();

    abTest.createExperiment({
      experimentId: 'feed-exp',
      name: 'Feed Experiment',
      controlAlgorithm: AlgorithmType.Chrono,
      treatmentAlgorithms: [AlgorithmType.Community],
    });

    const registry = new AlgorithmRegistry();
    registry.register(new ChronoRanker());
    registry.register(new CommunityRanker());
    const prefService = new UserPreferenceService();
    const antiRage = new AntiRageFilter();
    const items = [makeFeedItem({ id: '1' }), makeFeedItem({ id: '2' })];
    const feedService = new FeedService(registry, prefService, antiRage, () => items);

    const response = abTest.getFeedWithExperiment(
      feedService,
      { userId: 'user-1', feedId: 'main', page: 1, pageSize: 10 },
      'feed-exp',
    );

    expect(response.items).toHaveLength(2);
    // Algorithm should be one of the experiment algorithms
    expect([AlgorithmType.Chrono, AlgorithmType.Community]).toContain(response.algorithmUsed);
  });
});
