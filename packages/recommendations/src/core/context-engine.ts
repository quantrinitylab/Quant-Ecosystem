// ============================================================================
// Recommendations Package - Context Engine
// ============================================================================

import type { ContextFeatures, TimeOfDay, DeviceType, RecommendedItem } from '../types';

/** Context-based scoring rule */
interface ContextRule {
  id: string;
  feature: string;
  value: string;
  categoryBoosts: Map<string, number>;
  contentTypeBoosts: Map<string, number>;
}

/** Seasonal pattern */
interface SeasonalPattern {
  season: string;
  months: number[];
  categoryBoosts: Map<string, number>;
}

/** Context-aware recommendation engine */
export class ContextEngine {
  private contextRules: Map<string, ContextRule[]>;
  private seasonalPatterns: SeasonalPattern[];
  private devicePreferences: Map<DeviceType, Map<string, number>>;
  private timePreferences: Map<TimeOfDay, Map<string, number>>;
  private socialSignals: Map<string, Map<string, number>>;
  private locationPreferences: Map<string, Map<string, number>>;
  private userContextHistory: Map<string, ContextFeatures[]>;

  constructor() {
    this.contextRules = new Map();
    this.seasonalPatterns = [];
    this.devicePreferences = new Map();
    this.timePreferences = new Map();
    this.socialSignals = new Map();
    this.locationPreferences = new Map();
    this.userContextHistory = new Map();

    this.initializeDefaults();
  }

  /** Initialize default context preferences */
  private initializeDefaults(): void {
    // Time-of-day preferences
    this.timePreferences.set('morning', new Map([
      ['news', 1.5], ['productivity', 1.3], ['short_content', 1.4],
      ['education', 1.2], ['weather', 1.5], ['finance', 1.3],
    ]));
    this.timePreferences.set('afternoon', new Map([
      ['entertainment', 1.2], ['social', 1.3], ['shopping', 1.2],
      ['work', 1.1], ['medium_content', 1.3],
    ]));
    this.timePreferences.set('evening', new Map([
      ['entertainment', 1.5], ['streaming', 1.6], ['long_content', 1.4],
      ['social', 1.3], ['gaming', 1.4], ['relaxation', 1.3],
    ]));
    this.timePreferences.set('night', new Map([
      ['music', 1.3], ['asmr', 1.2], ['streaming', 1.4],
      ['short_content', 1.2], ['relaxation', 1.5],
    ]));

    // Device preferences
    this.devicePreferences.set('mobile', new Map([
      ['short_content', 1.5], ['notifications', 1.3], ['social', 1.4],
      ['quick_read', 1.3], ['vertical_video', 1.5],
    ]));
    this.devicePreferences.set('desktop', new Map([
      ['long_content', 1.4], ['productivity', 1.5], ['articles', 1.3],
      ['research', 1.4], ['horizontal_video', 1.3],
    ]));
    this.devicePreferences.set('tablet', new Map([
      ['medium_content', 1.3], ['reading', 1.4], ['magazines', 1.3],
      ['gaming', 1.2],
    ]));
    this.devicePreferences.set('tv', new Map([
      ['streaming', 1.6], ['long_content', 1.5], ['movies', 1.5],
      ['sports', 1.3],
    ]));
    this.devicePreferences.set('watch', new Map([
      ['notifications', 1.5], ['health', 1.4], ['quick_updates', 1.3],
    ]));

    // Seasonal patterns
    this.seasonalPatterns = [
      { season: 'winter', months: [12, 1, 2], categoryBoosts: new Map([
        ['indoor', 1.3], ['streaming', 1.2], ['holiday', 1.5], ['cooking', 1.2],
      ])},
      { season: 'spring', months: [3, 4, 5], categoryBoosts: new Map([
        ['outdoor', 1.3], ['fitness', 1.3], ['gardening', 1.4], ['travel', 1.2],
      ])},
      { season: 'summer', months: [6, 7, 8], categoryBoosts: new Map([
        ['outdoor', 1.5], ['travel', 1.4], ['sports', 1.3], ['events', 1.3],
      ])},
      { season: 'fall', months: [9, 10, 11], categoryBoosts: new Map([
        ['education', 1.3], ['productivity', 1.2], ['indoor', 1.2], ['cooking', 1.3],
      ])},
    ];
  }

  /** Get current time of day */
  getTimeOfDay(hour?: number): TimeOfDay {
    const h = hour !== undefined ? hour : new Date().getHours();
    if (h >= 5 && h < 12) return 'morning';
    if (h >= 12 && h < 17) return 'afternoon';
    if (h >= 17 && h < 21) return 'evening';
    return 'night';
  }

  /** Get current season */
  getCurrentSeason(month?: number): string {
    const m = month !== undefined ? month : new Date().getMonth() + 1;
    for (const pattern of this.seasonalPatterns) {
      if (pattern.months.includes(m)) return pattern.season;
    }
    return 'unknown';
  }

  /** Compute context score for an item */
  scoreItem(itemId: string, category: string, contentType: string, context: ContextFeatures): number {
    let score = 1.0;

    // Time-of-day boost
    const timeBoosts = this.timePreferences.get(context.timeOfDay);
    if (timeBoosts) {
      score *= timeBoosts.get(category) || 1.0;
      score *= timeBoosts.get(contentType) || 1.0;
    }

    // Device boost
    const deviceBoosts = this.devicePreferences.get(context.device);
    if (deviceBoosts) {
      score *= deviceBoosts.get(category) || 1.0;
      score *= deviceBoosts.get(contentType) || 1.0;
    }

    // Seasonal boost
    const season = context.season || this.getCurrentSeason();
    const seasonalPattern = this.seasonalPatterns.find(p => p.season === season);
    if (seasonalPattern) {
      score *= seasonalPattern.categoryBoosts.get(category) || 1.0;
    }

    // Location boost
    const locationBoosts = this.locationPreferences.get(context.location);
    if (locationBoosts) {
      score *= locationBoosts.get(category) || 1.0;
    }

    // Social context boost
    if (context.socialContext.length > 0) {
      const socialBoost = this.computeSocialBoost(itemId, context.socialContext);
      score *= socialBoost;
    }

    return score;
  }

  /** Compute social context boost */
  private computeSocialBoost(itemId: string, socialContext: string[]): number {
    let boost = 1.0;
    for (const friendId of socialContext) {
      const friendSignals = this.socialSignals.get(friendId);
      if (friendSignals && friendSignals.has(itemId)) {
        const friendScore = friendSignals.get(itemId)!;
        boost += friendScore * 0.1; // Each friend's engagement adds small boost
      }
    }
    return Math.min(boost, 2.0); // Cap at 2x boost
  }

  /** Record social signal (friend engaged with item) */
  recordSocialSignal(userId: string, itemId: string, score: number): void {
    if (!this.socialSignals.has(userId)) {
      this.socialSignals.set(userId, new Map());
    }
    this.socialSignals.get(userId)!.set(itemId, score);
  }

  /** Set location-based preferences */
  setLocationPreferences(location: string, preferences: Map<string, number>): void {
    this.locationPreferences.set(location, preferences);
  }

  /** Apply context scoring to a list of recommendations */
  applyContext(
    recommendations: RecommendedItem[],
    context: ContextFeatures,
    itemMetadata: Map<string, { category: string; contentType: string }>
  ): RecommendedItem[] {
    const rescored = recommendations.map(item => {
      const meta = itemMetadata.get(item.itemId);
      if (!meta) return item;

      const contextScore = this.scoreItem(item.itemId, meta.category, meta.contentType, context);
      return {
        ...item,
        score: item.score * contextScore,
      };
    });

    // Re-sort and re-rank
    rescored.sort((a, b) => b.score - a.score);
    return rescored.map((item, idx) => ({
      ...item,
      rank: idx + 1,
      source: `${item.source}+context`,
    }));
  }

  /** Record user context for learning */
  recordUserContext(userId: string, context: ContextFeatures): void {
    if (!this.userContextHistory.has(userId)) {
      this.userContextHistory.set(userId, []);
    }
    const history = this.userContextHistory.get(userId)!;
    history.push(context);
    if (history.length > 100) history.shift();
  }

  /** Add custom context rule */
  addRule(rule: ContextRule): void {
    if (!this.contextRules.has(rule.feature)) {
      this.contextRules.set(rule.feature, []);
    }
    this.contextRules.get(rule.feature)!.push(rule);
  }

  /** Get day-of-week preference multiplier */
  getDayOfWeekMultiplier(dayOfWeek: number, category: string): number {
    // Weekend vs weekday patterns
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    if (isWeekend) {
      const weekendBoosts: Record<string, number> = {
        entertainment: 1.3, streaming: 1.4, social: 1.2, outdoor: 1.3, shopping: 1.2,
      };
      return weekendBoosts[category] || 1.0;
    } else {
      const weekdayBoosts: Record<string, number> = {
        productivity: 1.3, news: 1.2, work: 1.3, education: 1.2, finance: 1.2,
      };
      return weekdayBoosts[category] || 1.0;
    }
  }
}
