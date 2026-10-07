import { describe, it, expect } from 'vitest';
import { UserPreferenceService } from '../user-preference.service.js';
import { AlgorithmType } from '../types.js';

describe('UserPreferenceService', () => {
  it('sets and gets a preference', () => {
    const service = new UserPreferenceService();

    service.setPreference('user1', 'feed-main', AlgorithmType.AI);

    const pref = service.getPreference('user1', 'feed-main');
    expect(pref.algorithm).toBe(AlgorithmType.AI);
    expect(pref.userId).toBe('user1');
    expect(pref.feedId).toBe('feed-main');
  });

  it('returns default algorithm when no preference set', () => {
    const service = new UserPreferenceService();

    const pref = service.getPreference('user1', 'feed-main');
    expect(pref.algorithm).toBe(AlgorithmType.Chrono);
  });

  it('handles per-feed preferences', () => {
    const service = new UserPreferenceService();

    service.setPreference('user1', 'feed-main', AlgorithmType.AI);
    service.setPreference('user1', 'feed-discover', AlgorithmType.Community);

    expect(service.getPreference('user1', 'feed-main').algorithm).toBe(AlgorithmType.AI);
    expect(service.getPreference('user1', 'feed-discover').algorithm).toBe(AlgorithmType.Community);
  });

  it('stores custom plugin id', () => {
    const service = new UserPreferenceService();

    service.setPreference('user1', 'feed-main', AlgorithmType.Custom, 'plugin-123');

    const pref = service.getPreference('user1', 'feed-main');
    expect(pref.algorithm).toBe(AlgorithmType.Custom);
    expect(pref.customPluginId).toBe('plugin-123');
  });

  it('gets and sets default algorithm', () => {
    const service = new UserPreferenceService();

    expect(service.getDefaultAlgorithm()).toBe(AlgorithmType.Chrono);

    service.setDefaultAlgorithm(AlgorithmType.AI);
    expect(service.getDefaultAlgorithm()).toBe(AlgorithmType.AI);
  });
});
