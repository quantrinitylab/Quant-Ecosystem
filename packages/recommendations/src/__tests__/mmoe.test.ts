import { describe, it, expect } from 'vitest';
import { MMoERanker } from '../ranking/mmoe';

describe('MMoERanker', () => {
  it('should throw when no experts configured', () => {
    const ranker = new MMoERanker();
    ranker.setObjectives([{ name: 'engagement', weight: 1 }]);

    expect(() => ranker.forward([1, 2, 3])).toThrow('No experts configured');
  });

  it('should throw when no objectives configured', () => {
    const ranker = new MMoERanker();
    ranker.addExpert('expert1', (f) => f.map((v) => v * 2));

    expect(() => ranker.forward([1, 2, 3])).toThrow('No objectives configured');
  });

  it('should produce scores for multiple objectives', () => {
    const ranker = new MMoERanker();

    ranker.addExpert('engagement_expert', (features) => features.map((f) => f * 2));
    ranker.addExpert('retention_expert', (features) => features.map((f) => f * 0.5));

    ranker.setObjectives([
      { name: 'engagement', weight: 0.5 },
      { name: 'retention', weight: 0.3 },
      { name: 'wellbeing', weight: 0.2 },
    ]);

    const scores = ranker.forward([0.5, 0.8, 0.3]);

    expect(scores).toHaveProperty('engagement');
    expect(scores).toHaveProperty('retention');
    expect(scores).toHaveProperty('wellbeing');

    // Scores should be between 0 and 1 (sigmoid output)
    expect(scores.engagement).toBeGreaterThan(0);
    expect(scores.engagement).toBeLessThan(1);
    expect(scores.retention).toBeGreaterThan(0);
    expect(scores.retention).toBeLessThan(1);
  });

  it('should support custom gating functions', () => {
    const ranker = new MMoERanker();

    ranker.addExpert('expert1', (features) => features.map((f) => f * 10));
    ranker.addExpert('expert2', (features) => features.map((f) => -f * 10));

    ranker.setObjectives([
      { name: 'engagement', weight: 1 },
      { name: 'retention', weight: 1 },
    ]);

    // Gate engagement to only use expert1
    ranker.setGating('engagement', () => [1, 0]);
    // Gate retention to only use expert2
    ranker.setGating('retention', () => [0, 1]);

    const scores = ranker.forward([0.5, 0.5, 0.5]);

    // engagement should use expert1 (positive output -> sigmoid > 0.5)
    expect(scores.engagement).toBeGreaterThan(0.5);
    // retention should use expert2 (negative output -> sigmoid < 0.5)
    expect(scores.retention).toBeLessThan(0.5);
  });

  it('should track expert and objective counts', () => {
    const ranker = new MMoERanker();

    ranker.addExpert('e1', (f) => f);
    ranker.addExpert('e2', (f) => f);
    ranker.setObjectives([
      { name: 'engagement', weight: 1 },
      { name: 'wellbeing', weight: 1 },
    ]);

    expect(ranker.getExpertCount()).toBe(2);
    expect(ranker.getObjectiveCount()).toBe(2);
  });
});
