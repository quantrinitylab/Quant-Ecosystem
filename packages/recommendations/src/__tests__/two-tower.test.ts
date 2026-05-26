import { describe, it, expect } from 'vitest';
import { TwoTowerRetrieval } from '../retrieval/two-tower';

describe('TwoTowerRetrieval', () => {
  const config = { userEmbeddingDim: 8, itemEmbeddingDim: 8, outputDim: 4 };

  it('should encode user features to embedding vector', () => {
    const tower = new TwoTowerRetrieval(config);
    const features = [1, 0.5, 0.3, 0.8, 0.2, 0.9, 0.4, 0.6];
    const embedding = tower.encodeUser(features);

    expect(embedding).toHaveLength(4);
    // L2 normalized: magnitude should be ~1
    const magnitude = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it('should encode item features to embedding vector', () => {
    const tower = new TwoTowerRetrieval(config);
    const features = [0.7, 0.1, 0.9, 0.4, 0.6, 0.3, 0.5, 0.8];
    const embedding = tower.encodeItem(features);

    expect(embedding).toHaveLength(4);
    const magnitude = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it('should build index from items', () => {
    const tower = new TwoTowerRetrieval(config);
    const items = [
      { id: 'item1', features: [1, 0, 0, 0, 0, 0, 0, 0] },
      { id: 'item2', features: [0, 1, 0, 0, 0, 0, 0, 0] },
      { id: 'item3', features: [0, 0, 1, 0, 0, 0, 0, 0] },
    ];

    tower.buildIndex(items);
    expect(tower.getIndexSize()).toBe(3);
  });

  it('should retrieve top-k candidates', () => {
    const tower = new TwoTowerRetrieval(config);
    const items = [
      { id: 'item1', features: [1, 0.5, 0.3, 0.8, 0.2, 0.9, 0.4, 0.6] },
      { id: 'item2', features: [0.7, 0.1, 0.9, 0.4, 0.6, 0.3, 0.5, 0.8] },
      { id: 'item3', features: [0.3, 0.8, 0.1, 0.6, 0.9, 0.2, 0.7, 0.4] },
      { id: 'item4', features: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5] },
      { id: 'item5', features: [0.9, 0.9, 0.1, 0.1, 0.9, 0.9, 0.1, 0.1] },
    ];

    tower.buildIndex(items);
    const results = tower.retrieve('user1', [1, 0.5, 0.3, 0.8, 0.2, 0.9, 0.4, 0.6], 3);

    expect(results).toHaveLength(3);
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    expect(results[1].score).toBeGreaterThanOrEqual(results[2].score);
    // Each result should have id and score
    expect(results[0]).toHaveProperty('id');
    expect(results[0]).toHaveProperty('score');
  });

  it('should retrieve by pre-computed embedding', () => {
    const tower = new TwoTowerRetrieval(config);
    const items = [
      { id: 'item1', features: [1, 0, 0, 0, 0, 0, 0, 0] },
      { id: 'item2', features: [0, 1, 0, 0, 0, 0, 0, 0] },
    ];

    tower.buildIndex(items);
    const userEmbedding = tower.encodeUser([1, 0, 0, 0, 0, 0, 0, 0]);
    const results = tower.retrieveByEmbedding(userEmbedding, 2);

    expect(results).toHaveLength(2);
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });

  it('should return empty array when no items indexed', () => {
    const tower = new TwoTowerRetrieval(config);
    const results = tower.retrieve('user1', [1, 0, 0, 0, 0, 0, 0, 0], 5);
    expect(results).toHaveLength(0);
  });
});
