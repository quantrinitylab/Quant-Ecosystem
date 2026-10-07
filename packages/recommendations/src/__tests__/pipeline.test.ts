import { describe, it, expect } from 'vitest';
import { RecommendationPipeline, PipelineCandidate } from '../pipeline';

describe('RecommendationPipeline', () => {
  function makeCandidate(id: string, score: number): PipelineCandidate {
    return {
      id,
      score,
      features: [score, 1 - score],
      source: 'test',
    };
  }

  it('should run full pipeline: retrieval -> ranking -> diversification', () => {
    const pipeline = new RecommendationPipeline({
      retrievalK: 10,
      rankingK: 5,
      finalK: 3,
    });

    // Mock retrieval
    pipeline.addRetrieval((_userId, _k) => [
      makeCandidate('item1', 0.9),
      makeCandidate('item2', 0.8),
      makeCandidate('item3', 0.7),
      makeCandidate('item4', 0.6),
      makeCandidate('item5', 0.5),
    ]);

    // Mock ranking: reverse order
    pipeline.setRanking((candidates) => {
      return [...candidates].sort((a, b) => a.score - b.score);
    });

    // Mock diversity: just take first k
    pipeline.setDiversity((candidates, k) => candidates.slice(0, k));

    const context = { device: 'mobile', timeOfDay: 'morning', sessionId: 'sess1' };
    const results = pipeline.recommend('user1', context);

    expect(results).toHaveLength(3);
  });

  it('should complete in < 50ms with mocked stages', () => {
    const pipeline = new RecommendationPipeline({
      retrievalK: 200,
      rankingK: 50,
      finalK: 20,
    });

    const candidates: PipelineCandidate[] = [];
    for (let i = 0; i < 200; i++) {
      candidates.push(makeCandidate(`item${i}`, Math.random()));
    }

    pipeline.addRetrieval(() => candidates);
    pipeline.setRanking((c) => [...c].sort((a, b) => b.score - a.score));
    pipeline.setDiversity((c, k) => c.slice(0, k));

    const context = { device: 'desktop', timeOfDay: 'evening', sessionId: 'sess2' };

    const start = performance.now();
    const results = pipeline.recommend('user1', context);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
    expect(results).toHaveLength(20);
  });

  it('should merge candidates from multiple retrieval sources', () => {
    const pipeline = new RecommendationPipeline({
      retrievalK: 10,
      rankingK: 10,
      finalK: 4,
    });

    pipeline.addRetrieval(() => [makeCandidate('item1', 0.9), makeCandidate('item2', 0.8)]);

    pipeline.addRetrieval(() => [makeCandidate('item3', 0.85), makeCandidate('item4', 0.7)]);

    const context = { device: 'mobile', timeOfDay: 'night', sessionId: 'sess3' };
    const results = pipeline.recommend('user1', context);

    expect(results).toHaveLength(4);
    const ids = results.map((r) => r.id);
    expect(ids).toContain('item1');
    expect(ids).toContain('item2');
    expect(ids).toContain('item3');
    expect(ids).toContain('item4');
  });

  it('should deduplicate candidates by id keeping highest score', () => {
    const pipeline = new RecommendationPipeline({
      retrievalK: 10,
      rankingK: 10,
      finalK: 10,
    });

    pipeline.addRetrieval(() => [makeCandidate('item1', 0.5)]);
    pipeline.addRetrieval(() => [makeCandidate('item1', 0.9)]);

    const context = { device: 'mobile', timeOfDay: 'morning', sessionId: 'sess4' };
    const results = pipeline.recommend('user1', context);

    expect(results).toHaveLength(1);
    expect(results[0]!.score).toBe(0.9);
  });

  it('should handle empty retrieval gracefully', () => {
    const pipeline = new RecommendationPipeline();
    pipeline.addRetrieval(() => []);

    const context = { device: 'mobile', timeOfDay: 'morning', sessionId: 'sess5' };
    const results = pipeline.recommend('user1', context);

    expect(results).toHaveLength(0);
  });

  it('should work without ranking or diversity configured', () => {
    const pipeline = new RecommendationPipeline({ finalK: 2 });

    pipeline.addRetrieval(() => [
      makeCandidate('item1', 0.5),
      makeCandidate('item2', 0.9),
      makeCandidate('item3', 0.7),
    ]);

    const context = { device: 'desktop', timeOfDay: 'afternoon', sessionId: 'sess6' };
    const results = pipeline.recommend('user1', context);

    // Should sort by score and take top 2
    expect(results).toHaveLength(2);
    expect(results[0]!.id).toBe('item2');
    expect(results[1]!.id).toBe('item3');
  });
});
