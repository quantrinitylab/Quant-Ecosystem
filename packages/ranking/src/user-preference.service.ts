// ============================================================================
// User Preference Service - Manages user algorithm preferences per feed
// ============================================================================

import type { UserAlgorithmPreference } from './types.js';
import { AlgorithmType } from './types.js';

export class UserPreferenceService {
  private preferences: Map<string, UserAlgorithmPreference> = new Map();
  private defaultAlgorithm: AlgorithmType = AlgorithmType.Chrono;

  private makeKey(userId: string, feedId: string): string {
    return `${userId}:${feedId}`;
  }

  setPreference(
    userId: string,
    feedId: string,
    algorithm: AlgorithmType,
    customPluginId?: string,
  ): void {
    const key = this.makeKey(userId, feedId);
    this.preferences.set(key, {
      userId,
      feedId,
      algorithm,
      customPluginId,
    });
  }

  getPreference(userId: string, feedId: string): UserAlgorithmPreference {
    const key = this.makeKey(userId, feedId);
    const pref = this.preferences.get(key);

    if (pref) {
      return pref;
    }

    return {
      userId,
      feedId,
      algorithm: this.defaultAlgorithm,
    };
  }

  getDefaultAlgorithm(): AlgorithmType {
    return this.defaultAlgorithm;
  }

  setDefaultAlgorithm(algorithm: AlgorithmType): void {
    this.defaultAlgorithm = algorithm;
  }
}
