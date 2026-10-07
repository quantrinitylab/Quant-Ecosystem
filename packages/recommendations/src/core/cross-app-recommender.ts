// ============================================================================
// Recommendations Package - Cross-App Recommender
// ============================================================================

import type { CrossAppMapping, RecommendedItem } from '../types';

/** Unified user preference entry */
interface UnifiedPreference {
  interest: string;
  score: number;
  sourceApps: string[];
  lastUpdated: number;
}

/** Cross-application recommendation engine with shared embeddings */
export class CrossAppRecommender {
  private appMappings: Map<string, CrossAppMapping>;
  private userEmbeddings: Map<string, Map<string, number>>;
  private appFilters: Map<string, Set<string>>;
  private preferenceGraph: Map<string, Map<string, UnifiedPreference>>;
  private appItemCatalogs: Map<string, Set<string>>;
  private transferWeights: Map<string, Map<string, number>>;

  constructor() {
    this.appMappings = new Map();
    this.userEmbeddings = new Map();
    this.appFilters = new Map();
    this.preferenceGraph = new Map();
    this.appItemCatalogs = new Map();
    this.transferWeights = new Map();
  }

  /** Register a cross-domain interest mapping */
  registerMapping(mapping: CrossAppMapping): void {
    const key = `${mapping.sourceApp}:${mapping.targetApp}`;
    this.appMappings.set(key, mapping);
  }

  /** Register items available in an app */
  registerAppCatalog(appId: string, itemIds: string[]): void {
    this.appItemCatalogs.set(appId, new Set(itemIds));
  }

  /** Set app-specific content filters */
  setAppFilter(appId: string, excludedCategories: Set<string>): void {
    this.appFilters.set(appId, excludedCategories);
  }

  /** Record user interest from any app */
  recordInterest(userId: string, appId: string, interest: string, score: number): void {
    if (!this.preferenceGraph.has(userId)) {
      this.preferenceGraph.set(userId, new Map());
    }
    const userPrefs = this.preferenceGraph.get(userId)!;
    const key = `${appId}:${interest}`;

    const existing = userPrefs.get(key);
    if (existing) {
      existing.score = existing.score * 0.8 + score * 0.2; // EMA
      existing.lastUpdated = Date.now();
      if (!existing.sourceApps.includes(appId)) {
        existing.sourceApps.push(appId);
      }
    } else {
      userPrefs.set(key, {
        interest,
        score,
        sourceApps: [appId],
        lastUpdated: Date.now(),
      });
    }

    // Update unified embedding
    this.updateUserEmbedding(userId, interest, score);
  }

  /** Update shared user embedding space */
  private updateUserEmbedding(userId: string, interest: string, score: number): void {
    if (!this.userEmbeddings.has(userId)) {
      this.userEmbeddings.set(userId, new Map());
    }
    const embedding = this.userEmbeddings.get(userId)!;
    const current = embedding.get(interest) || 0;
    embedding.set(interest, current * 0.9 + score * 0.1);
  }

  /** Map interests from source app to target app */
  mapInterests(userId: string, sourceApp: string, targetApp: string): Map<string, number> {
    const mappingKey = `${sourceApp}:${targetApp}`;
    const mapping = this.appMappings.get(mappingKey);
    const mappedInterests: Map<string, number> = new Map();

    const userPrefs = this.preferenceGraph.get(userId);
    if (!userPrefs) return mappedInterests;

    // Get source app interests
    for (const [key, pref] of userPrefs) {
      if (!key.startsWith(`${sourceApp}:`)) continue;

      if (mapping) {
        // Use defined mapping
        const targetInterests = mapping.interestMap.get(pref.interest);
        if (targetInterests) {
          for (const targetInterest of targetInterests) {
            const current = mappedInterests.get(targetInterest) || 0;
            mappedInterests.set(targetInterest, current + pref.score * mapping.weight);
          }
        }
      } else {
        // Direct transfer with reduced weight
        const current = mappedInterests.get(pref.interest) || 0;
        mappedInterests.set(pref.interest, current + pref.score * 0.5);
      }
    }

    return mappedInterests;
  }

  /** Get unified preference profile across all apps */
  getUnifiedProfile(userId: string): Map<string, number> {
    const embedding = this.userEmbeddings.get(userId);
    if (!embedding) return new Map();
    return new Map(embedding);
  }

  /** Generate cross-app recommendations for a target app */
  recommend(userId: string, targetApp: string, topN: number = 10): RecommendedItem[] {
    const candidates: Map<string, number> = new Map();
    const appCatalog = this.appItemCatalogs.get(targetApp);
    const appFilter = this.appFilters.get(targetApp);

    // Gather interests from all source apps
    for (const [mappingKey, mapping] of this.appMappings) {
      if (!mappingKey.endsWith(`:${targetApp}`)) continue;

      const sourceApp = mapping.sourceApp;
      const mappedInterests = this.mapInterests(userId, sourceApp, targetApp);

      for (const [interest, score] of mappedInterests) {
        // Check app-specific filters
        if (appFilter && appFilter.has(interest)) continue;

        const current = candidates.get(interest) || 0;
        candidates.set(interest, current + score);
      }
    }

    // Also include direct preferences for target app
    const userPrefs = this.preferenceGraph.get(userId);
    if (userPrefs) {
      for (const [key, pref] of userPrefs) {
        if (!key.startsWith(`${targetApp}:`)) continue;
        const current = candidates.get(pref.interest) || 0;
        candidates.set(pref.interest, current + pref.score * 1.5); // Boost native app prefs
      }
    }

    // Filter to items available in target app
    let filteredCandidates: Map<string, number>;
    if (appCatalog) {
      filteredCandidates = new Map();
      for (const [itemId, score] of candidates) {
        if (appCatalog.has(itemId)) {
          filteredCandidates.set(itemId, score);
        }
      }
    } else {
      filteredCandidates = candidates;
    }

    // Sort and return
    const sorted = Array.from(filteredCandidates.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN);

    return sorted.map(([itemId, score], idx) => ({
      itemId,
      score: this.normalizeScore(score, sorted),
      rank: idx + 1,
      source: `cross_app:${targetApp}`,
      reason: 'Based on your activity across apps',
    }));
  }

  /** Normalize scores to 0-1 range */
  private normalizeScore(score: number, all: [string, number][]): number {
    if (all.length === 0) return 0;
    const maxScore = all[0]![1];
    return maxScore > 0 ? score / maxScore : 0;
  }

  /** Compute similarity between two users in shared embedding space */
  computeUserSimilarity(userA: string, userB: string): number {
    const embA = this.userEmbeddings.get(userA);
    const embB = this.userEmbeddings.get(userB);
    if (!embA || !embB) return 0;

    let dot = 0;
    let magA = 0;
    let magB = 0;

    for (const [key, valA] of embA) {
      magA += valA * valA;
      if (embB.has(key)) {
        dot += valA * embB.get(key)!;
      }
    }
    for (const valB of embB.values()) {
      magB += valB * valB;
    }

    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
  }

  /** Set transfer learning weights between apps */
  setTransferWeight(sourceApp: string, targetApp: string, weight: number): void {
    if (!this.transferWeights.has(sourceApp)) {
      this.transferWeights.set(sourceApp, new Map());
    }
    this.transferWeights.get(sourceApp)!.set(targetApp, Math.max(0, Math.min(1, weight)));
  }

  /** Get apps that a user is active in */
  getUserActiveApps(userId: string): string[] {
    const userPrefs = this.preferenceGraph.get(userId);
    if (!userPrefs) return [];

    const apps = new Set<string>();
    for (const [key] of userPrefs) {
      const appId = key.split(':')[0]!;
      apps.add(appId);
    }
    return Array.from(apps);
  }

  /** Get cross-app interest overlap between two apps for a user */
  getInterestOverlap(userId: string, appA: string, appB: string): number {
    const userPrefs = this.preferenceGraph.get(userId);
    if (!userPrefs) return 0;

    const interestsA = new Set<string>();
    const interestsB = new Set<string>();

    for (const [key, pref] of userPrefs) {
      if (key.startsWith(`${appA}:`)) interestsA.add(pref.interest);
      if (key.startsWith(`${appB}:`)) interestsB.add(pref.interest);
    }

    if (interestsA.size === 0 || interestsB.size === 0) return 0;

    let intersection = 0;
    for (const interest of interestsA) {
      if (interestsB.has(interest)) intersection++;
    }

    const union = interestsA.size + interestsB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }
}
