import { describe, it, expect } from 'vitest';
import { AlgorithmRegistry } from '../algorithm-registry.js';
import { ChronoRanker } from '../chrono-ranker.js';
import { AIRanker } from '../ai-ranker.js';
import { CommunityRanker } from '../community-ranker.js';
import { AlgorithmType } from '../types.js';

describe('AlgorithmRegistry', () => {
  it('registers and retrieves an algorithm', () => {
    const registry = new AlgorithmRegistry();
    const chrono = new ChronoRanker();

    registry.register(chrono);

    expect(registry.get(AlgorithmType.Chrono)).toBe(chrono);
  });

  it('returns undefined for unregistered algorithm', () => {
    const registry = new AlgorithmRegistry();

    expect(registry.get(AlgorithmType.AI)).toBeUndefined();
  });

  it('registers multiple algorithms', () => {
    const registry = new AlgorithmRegistry();
    const chrono = new ChronoRanker();
    const ai = new AIRanker();
    const community = new CommunityRanker();

    registry.register(chrono);
    registry.register(ai);
    registry.register(community);

    expect(registry.get(AlgorithmType.Chrono)).toBe(chrono);
    expect(registry.get(AlgorithmType.AI)).toBe(ai);
    expect(registry.get(AlgorithmType.Community)).toBe(community);
  });

  it('lists all registered algorithms', () => {
    const registry = new AlgorithmRegistry();
    const chrono = new ChronoRanker();
    const ai = new AIRanker();

    registry.register(chrono);
    registry.register(ai);

    const list = registry.list();
    expect(list).toHaveLength(2);
    expect(list).toContain(chrono);
    expect(list).toContain(ai);
  });

  it('checks if algorithm is registered', () => {
    const registry = new AlgorithmRegistry();
    const chrono = new ChronoRanker();

    registry.register(chrono);

    expect(registry.has(AlgorithmType.Chrono)).toBe(true);
    expect(registry.has(AlgorithmType.AI)).toBe(false);
  });

  it('unregisters an algorithm', () => {
    const registry = new AlgorithmRegistry();
    const chrono = new ChronoRanker();

    registry.register(chrono);
    expect(registry.has(AlgorithmType.Chrono)).toBe(true);

    registry.unregister(AlgorithmType.Chrono);
    expect(registry.has(AlgorithmType.Chrono)).toBe(false);
  });
});
