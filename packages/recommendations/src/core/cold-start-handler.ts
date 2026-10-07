// ============================================================================
// Recommendations Package - Cold Start Handler
// ============================================================================

import type { ColdStartConfig, UserProfile, RecommendedItem } from '../types';

/** Handles cold start problem for new users and new items */
export class ColdStartHandler {
  private config: ColdStartConfig;
  private popularItems: Map<string, number>;
  private categoryPopularity: Map<string, Map<string, number>>;
  private demographicProfiles: Map<string, Map<string, number>>;
  private onboardingPreferences: Map<string, string[]>;
  private itemInteractionCounts: Map<string, number>;
  private explorationArms: Map<string, { successes: number; trials: number }>;

  constructor(config: ColdStartConfig) {
    this.config = config;
    this.popularItems = new Map();
    this.categoryPopularity = new Map();
    this.demographicProfiles = new Map();
    this.onboardingPreferences = new Map();
    this.itemInteractionCounts = new Map();
    this.explorationArms = new Map();
  }

  /** Update popularity scores based on interactions */
  recordInteraction(itemId: string, category: string): void {
    this.popularItems.set(itemId, (this.popularItems.get(itemId) || 0) + 1);
    this.itemInteractionCounts.set(itemId, (this.itemInteractionCounts.get(itemId) || 0) + 1);

    if (!this.categoryPopularity.has(category)) {
      this.categoryPopularity.set(category, new Map());
    }
    const catMap = this.categoryPopularity.get(category)!;
    catMap.set(itemId, (catMap.get(itemId) || 0) + 1);
  }

  /** Record demographic preference patterns */
  recordDemographicPreference(demographicKey: string, itemId: string, score: number): void {
    if (!this.demographicProfiles.has(demographicKey)) {
      this.demographicProfiles.set(demographicKey, new Map());
    }
    const profile = this.demographicProfiles.get(demographicKey)!;
    const current = profile.get(itemId) || 0;
    profile.set(itemId, current + score);
  }

  /** Store onboarding quiz preferences */
  setOnboardingPreferences(userId: string, preferences: string[]): void {
    this.onboardingPreferences.set(userId, preferences);
  }

  /** Check if a user is in cold start state */
  isNewUser(interactionCount: number): boolean {
    return interactionCount < this.config.minInteractions;
  }

  /** Check if an item is in cold start state */
  isNewItem(itemId: string): boolean {
    const count = this.itemInteractionCounts.get(itemId) || 0;
    return count < this.config.minInteractions;
  }

  /** Get recommendations for a new user */
  recommendForNewUser(user: UserProfile, topN: number = 10): RecommendedItem[] {
    switch (this.config.strategy) {
      case 'popularity':
        return this.popularityBased(topN);
      case 'demographic':
        return this.demographicBased(user, topN);
      case 'onboarding':
        return this.onboardingBased(user.id, topN);
      case 'exploration':
        return this.explorationBased(topN);
      case 'hybrid':
        return this.hybridColdStart(user, topN);
      default:
        return this.popularityBased(topN);
    }
  }

  /** Popularity-based recommendations */
  private popularityBased(topN: number): RecommendedItem[] {
    const sorted = Array.from(this.popularItems.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN);

    return sorted.map(([itemId, score], idx) => ({
      itemId,
      score: score / (sorted[0]?.[1] || 1), // Normalize to 0-1
      rank: idx + 1,
      source: 'cold_start_popularity',
      reason: 'Popular with other users',
    }));
  }

  /** Demographic-based recommendations */
  private demographicBased(user: UserProfile, topN: number): RecommendedItem[] {
    // Build demographic key from user profile
    const demoKey = `${user.demographics.ageRange}:${user.demographics.location}`;
    const demoProfile = this.demographicProfiles.get(demoKey);

    if (!demoProfile || demoProfile.size === 0) {
      // Fall back to broader demographics
      const broadKey = user.demographics.ageRange;
      const broadProfile = this.demographicProfiles.get(broadKey);
      if (!broadProfile) return this.popularityBased(topN);

      return this.sortProfileToRecommendations(broadProfile, topN, 'demographic_broad');
    }

    return this.sortProfileToRecommendations(demoProfile, topN, 'demographic');
  }

  /** Convert profile scores to sorted recommendations */
  private sortProfileToRecommendations(
    profile: Map<string, number>,
    topN: number,
    source: string,
  ): RecommendedItem[] {
    const sorted = Array.from(profile.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN);

    const maxScore = sorted[0]?.[1] || 1;
    return sorted.map(([itemId, score], idx) => ({
      itemId,
      score: score / maxScore,
      rank: idx + 1,
      source: `cold_start_${source}`,
      reason: 'Recommended for users like you',
    }));
  }

  /** Onboarding quiz-based recommendations */
  private onboardingBased(userId: string, topN: number): RecommendedItem[] {
    const preferences = this.onboardingPreferences.get(userId);
    if (!preferences || preferences.length === 0) {
      return this.popularityBased(topN);
    }

    // Get items matching onboarding category preferences
    const candidates: Map<string, number> = new Map();

    for (const category of preferences) {
      const catItems = this.categoryPopularity.get(category);
      if (!catItems) continue;

      for (const [itemId, score] of catItems) {
        const current = candidates.get(itemId) || 0;
        candidates.set(itemId, current + score);
      }
    }

    return this.sortProfileToRecommendations(candidates, topN, 'onboarding');
  }

  /** Exploration-based recommendations (epsilon-greedy) */
  private explorationBased(topN: number): RecommendedItem[] {
    const results: RecommendedItem[] = [];
    const allItems = Array.from(this.popularItems.keys());
    if (allItems.length === 0) return [];

    for (let i = 0; i < topN; i++) {
      if (Math.random() < this.config.explorationRate) {
        // Explore: random item
        const randomIdx = Math.floor(Math.random() * allItems.length);
        results.push({
          itemId: allItems[randomIdx]!,
          score: 0.5,
          rank: i + 1,
          source: 'cold_start_exploration',
          reason: 'Discovering new content for you',
        });
      } else {
        // Exploit: use UCB1 for arm selection
        const arm = this.selectUCB1Arm(allItems);
        results.push({
          itemId: arm,
          score: 0.7,
          rank: i + 1,
          source: 'cold_start_exploit',
          reason: 'Based on early signals',
        });
      }
    }

    return results;
  }

  /** UCB1 arm selection */
  private selectUCB1Arm(items: string[]): string {
    let bestItem = items[0]!;
    let bestUCB = -Infinity;
    let totalTrials = 0;

    for (const item of items) {
      const arm = this.explorationArms.get(item) || { successes: 0, trials: 0 };
      totalTrials += arm.trials;
    }

    for (const item of items) {
      const arm = this.explorationArms.get(item) || { successes: 0, trials: 0 };
      if (arm.trials === 0) return item; // Unexplored arm

      const avgReward = arm.successes / arm.trials;
      const exploration = Math.sqrt((2 * Math.log(totalTrials + 1)) / arm.trials);
      const ucb = avgReward + exploration;

      if (ucb > bestUCB) {
        bestUCB = ucb;
        bestItem = item;
      }
    }

    return bestItem;
  }

  /** Hybrid cold start: blend multiple strategies */
  private hybridColdStart(user: UserProfile, topN: number): RecommendedItem[] {
    const popularRecs = this.popularityBased(topN);
    const demoRecs = this.demographicBased(user, topN);
    const onboardingRecs = this.onboardingBased(user.id, topN);

    // Merge with weighted scoring
    const combined: Map<string, number> = new Map();
    const demoWeight = this.config.demographicWeight;
    const popWeight = 1 - demoWeight;

    for (const rec of popularRecs) {
      combined.set(rec.itemId, (combined.get(rec.itemId) || 0) + rec.score * popWeight * 0.5);
    }
    for (const rec of demoRecs) {
      combined.set(rec.itemId, (combined.get(rec.itemId) || 0) + rec.score * demoWeight);
    }
    for (const rec of onboardingRecs) {
      combined.set(rec.itemId, (combined.get(rec.itemId) || 0) + rec.score * 0.8);
    }

    return this.sortProfileToRecommendations(combined, topN, 'hybrid');
  }

  /** Record exploration feedback (for bandit updates) */
  recordExplorationFeedback(itemId: string, success: boolean): void {
    const arm = this.explorationArms.get(itemId) || { successes: 0, trials: 0 };
    arm.trials++;
    if (success) arm.successes++;
    this.explorationArms.set(itemId, arm);
  }

  /** Get transition score: how much to blend personalized vs cold-start */
  getTransitionWeight(interactionCount: number): number {
    // Sigmoid transition from cold-start to personalized
    const midpoint = this.config.minInteractions / 2;
    const steepness = 0.5;
    return 1 / (1 + Math.exp(-steepness * (interactionCount - midpoint)));
  }

  /** Blend cold-start with personalized recommendations */
  blendWithPersonalized(
    coldStartRecs: RecommendedItem[],
    personalizedRecs: RecommendedItem[],
    interactionCount: number,
    topN: number,
  ): RecommendedItem[] {
    const personalizedWeight = this.getTransitionWeight(interactionCount);
    const coldStartWeight = 1 - personalizedWeight;

    const combined: Map<string, number> = new Map();

    for (const rec of coldStartRecs) {
      combined.set(rec.itemId, (combined.get(rec.itemId) || 0) + rec.score * coldStartWeight);
    }
    for (const rec of personalizedRecs) {
      combined.set(rec.itemId, (combined.get(rec.itemId) || 0) + rec.score * personalizedWeight);
    }

    const sorted = Array.from(combined.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN);

    return sorted.map(([itemId, score], idx) => ({
      itemId,
      score,
      rank: idx + 1,
      source: `transition_${Math.round(personalizedWeight * 100)}pct_personalized`,
      reason: personalizedWeight > 0.5 ? 'Personalized for you' : 'Getting to know your taste',
    }));
  }
}
