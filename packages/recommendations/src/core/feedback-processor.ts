// ============================================================================
// Recommendations Package - Feedback Processor
// ============================================================================

import type { FeedbackEvent, FeedbackType } from '../types';

/** Processed feedback signal */
interface ProcessedSignal {
  userId: string;
  itemId: string;
  normalizedScore: number;
  rawScore: number;
  decayedScore: number;
  timestamp: number;
  isNoise: boolean;
}

/** Feedback loop detection result */
interface FeedbackLoopResult {
  isEchoChamber: boolean;
  diversityScore: number;
  dominantCategories: string[];
  recommendations: string[];
}

/** Processes implicit and explicit feedback signals for recommendation tuning */
export class FeedbackProcessor {
  private feedbackHistory: Map<string, FeedbackEvent[]>;
  private userScores: Map<string, Map<string, number>>;
  private userNorms: Map<string, { min: number; max: number; mean: number }>;
  private signalWeights: Map<FeedbackType, number>;
  private noiseThreshold: number;
  private decayHalfLife: number;
  private itemCategories: Map<string, string>;
  private maxHistorySize: number;

  constructor() {
    this.feedbackHistory = new Map();
    this.userScores = new Map();
    this.userNorms = new Map();
    this.itemCategories = new Map();
    this.noiseThreshold = 500; // Minimum dwell time in ms to count
    this.decayHalfLife = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
    this.maxHistorySize = 10000;

    // Signal weights for implicit/explicit signals
    this.signalWeights = new Map([
      ['view', 1],
      ['click', 2],
      ['dwell', 3],
      ['scroll', 1.5],
      ['like', 10],
      ['dislike', -10],
      ['share', 8],
      ['save', 5],
      ['purchase', 15],
      ['rating', 0], // Use actual rating value
    ]);
  }

  /** Register item category for feedback loop detection */
  registerItemCategory(itemId: string, category: string): void {
    this.itemCategories.set(itemId, category);
  }

  /** Process a feedback event */
  processFeedback(event: FeedbackEvent): ProcessedSignal {
    // Store in history
    if (!this.feedbackHistory.has(event.userId)) {
      this.feedbackHistory.set(event.userId, []);
    }
    const history = this.feedbackHistory.get(event.userId)!;
    history.push(event);
    if (history.length > this.maxHistorySize) {
      history.shift();
    }

    // Check for noise
    const isNoise = this.isNoiseSignal(event);

    // Compute raw score
    const rawScore = this.computeRawScore(event);

    // Apply temporal decay
    const decayedScore = this.applyTemporalDecay(rawScore, event.timestamp);

    // Normalize per user
    const normalizedScore = this.normalizeForUser(event.userId, decayedScore);

    // Update user score map
    if (!this.userScores.has(event.userId)) {
      this.userScores.set(event.userId, new Map());
    }
    const scores = this.userScores.get(event.userId)!;
    const current = scores.get(event.itemId) || 0;
    scores.set(event.itemId, current + (isNoise ? 0 : normalizedScore));

    return {
      userId: event.userId,
      itemId: event.itemId,
      normalizedScore,
      rawScore,
      decayedScore,
      timestamp: event.timestamp,
      isNoise,
    };
  }

  /** Compute raw score from feedback event */
  private computeRawScore(event: FeedbackEvent): number {
    if (event.type === 'rating') {
      // Direct rating value (typically 1-5)
      return event.value;
    }

    if (event.type === 'dwell') {
      // Dwell time scoring: logarithmic scale
      const dwellSeconds = event.value / 1000;
      return Math.log(1 + dwellSeconds) * 2;
    }

    if (event.type === 'scroll') {
      // Scroll depth scoring (0-100%)
      return event.value / 100 * 3;
    }

    // Use configured weight
    const weight = this.signalWeights.get(event.type) || 1;
    return weight * event.value;
  }

  /** Check if a signal is noise (accidental click, too short dwell) */
  private isNoiseSignal(event: FeedbackEvent): boolean {
    // Very short dwell times are likely noise
    if (event.type === 'dwell' && event.value < this.noiseThreshold) {
      return true;
    }

    // Click immediately followed by back navigation
    if (event.type === 'click') {
      const history = this.feedbackHistory.get(event.userId) || [];
      const recentEvents = history.filter(
        e => e.itemId === event.itemId && Math.abs(e.timestamp - event.timestamp) < 2000
      );
      // Multiple rapid clicks on same item = noise
      if (recentEvents.length > 3) return true;
    }

    // Zero-value explicit signals
    if (event.type === 'rating' && event.value === 0) return true;

    return false;
  }

  /** Apply temporal decay (exponential) */
  private applyTemporalDecay(score: number, timestamp: number): number {
    const now = Date.now();
    const age = now - timestamp;
    // Exponential decay: score * 2^(-age/halfLife)
    const decayFactor = Math.pow(2, -age / this.decayHalfLife);
    return score * decayFactor;
  }

  /** Normalize score for a user (z-score normalization) */
  private normalizeForUser(userId: string, score: number): number {
    const norms = this.userNorms.get(userId);
    if (!norms) {
      // Initialize norms with first score
      this.userNorms.set(userId, { min: score, max: score, mean: score });
      return 0.5; // Neutral starting point
    }

    // Update running min/max/mean
    norms.min = Math.min(norms.min, score);
    norms.max = Math.max(norms.max, score);
    const history = this.feedbackHistory.get(userId) || [];
    if (history.length > 0) {
      norms.mean = norms.mean * 0.95 + score * 0.05; // EMA
    }

    // Min-max normalization to 0-1
    const range = norms.max - norms.min;
    if (range === 0) return 0.5;
    return Math.max(0, Math.min(1, (score - norms.min) / range));
  }

  /** Get aggregated preference score for user-item pair */
  getPreferenceScore(userId: string, itemId: string): number {
    const scores = this.userScores.get(userId);
    if (!scores) return 0;
    return scores.get(itemId) || 0;
  }

  /** Get top preferred items for a user */
  getTopPreferences(userId: string, topN: number = 20): Array<{ itemId: string; score: number }> {
    const scores = this.userScores.get(userId);
    if (!scores) return [];

    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([itemId, score]) => ({ itemId, score }));
  }

  /** Detect feedback loops (echo chambers) */
  detectFeedbackLoop(userId: string): FeedbackLoopResult {
    const history = this.feedbackHistory.get(userId) || [];
    if (history.length < 20) {
      return { isEchoChamber: false, diversityScore: 1, dominantCategories: [], recommendations: [] };
    }

    // Analyze category distribution of positive interactions
    const categoryCounts: Map<string, number> = new Map();
    let totalPositive = 0;

    for (const event of history) {
      if (event.type === 'dislike') continue;
      const category = this.itemCategories.get(event.itemId) || 'unknown';
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
      totalPositive++;
    }

    if (totalPositive === 0) {
      return { isEchoChamber: false, diversityScore: 1, dominantCategories: [], recommendations: [] };
    }

    // Calculate Shannon entropy for diversity
    let entropy = 0;
    for (const count of categoryCounts.values()) {
      const p = count / totalPositive;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    // Max entropy = log2(number of categories)
    const maxEntropy = Math.log2(Math.max(categoryCounts.size, 1));
    const diversityScore = maxEntropy > 0 ? entropy / maxEntropy : 0;

    // Find dominant categories (> 50% of interactions)
    const dominantCategories: string[] = [];
    for (const [category, count] of categoryCounts) {
      if (count / totalPositive > 0.5) {
        dominantCategories.push(category);
      }
    }

    const isEchoChamber = diversityScore < 0.3 || dominantCategories.length > 0;

    const recommendations: string[] = [];
    if (isEchoChamber) {
      recommendations.push('Increase diversity in recommendations');
      recommendations.push('Inject items from underrepresented categories');
      recommendations.push('Apply MMR to diversify results');
    }

    return { isEchoChamber, diversityScore, dominantCategories, recommendations };
  }

  /** Batch process multiple feedback events */
  processBatch(events: FeedbackEvent[]): ProcessedSignal[] {
    return events.map(event => this.processFeedback(event));
  }

  /** Get user engagement summary */
  getUserEngagement(userId: string): {
    totalSignals: number;
    positiveRatio: number;
    avgScore: number;
    activeCategories: number;
  } {
    const history = this.feedbackHistory.get(userId) || [];
    if (history.length === 0) {
      return { totalSignals: 0, positiveRatio: 0, avgScore: 0, activeCategories: 0 };
    }

    let positiveCount = 0;
    let totalScore = 0;
    const categories = new Set<string>();

    for (const event of history) {
      const score = this.computeRawScore(event);
      totalScore += score;
      if (score > 0) positiveCount++;
      const cat = this.itemCategories.get(event.itemId);
      if (cat) categories.add(cat);
    }

    return {
      totalSignals: history.length,
      positiveRatio: positiveCount / history.length,
      avgScore: totalScore / history.length,
      activeCategories: categories.size,
    };
  }

  /** Configure signal weights */
  setSignalWeight(type: FeedbackType, weight: number): void {
    this.signalWeights.set(type, weight);
  }

  /** Set decay half-life */
  setDecayHalfLife(ms: number): void {
    this.decayHalfLife = ms;
  }
}
