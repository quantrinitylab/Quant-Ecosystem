// ============================================================================
// Recommendations Package - Real-time Personalizer
// ============================================================================

import type { PersonalizationConfig, SessionSignal, RecommendedItem } from '../types';

/** Arm state for multi-armed bandit */
interface BanditArm {
  itemId: string;
  pulls: number;
  totalReward: number;
  avgReward: number;
  lastPulled: number;
  alphaParam: number;
  betaParam: number;
}

/** Real-time personalization with session-based scoring and bandits */
export class RealtimePersonalizer {
  private config: PersonalizationConfig;
  private sessionSignals: Map<string, SessionSignal[]>;
  private userScores: Map<string, Map<string, number>>;
  private banditArms: Map<string, BanditArm>;
  private contextWeights: Map<string, Map<string, number>>;
  private impressions: Map<string, number>;
  private clickHistory: Map<string, string[]>;

  constructor(config: PersonalizationConfig) {
    this.config = config;
    this.sessionSignals = new Map();
    this.userScores = new Map();
    this.banditArms = new Map();
    this.contextWeights = new Map();
    this.impressions = new Map();
    this.clickHistory = new Map();
  }

  /** Record a session signal */
  recordSignal(userId: string, signal: SessionSignal): void {
    if (!this.sessionSignals.has(userId)) {
      this.sessionSignals.set(userId, []);
    }
    const signals = this.sessionSignals.get(userId)!;
    signals.push(signal);

    // Keep only recent signals
    const maxAge = 30 * 60 * 1000; // 30 minutes
    const cutoff = Date.now() - maxAge;
    const filtered = signals.filter((s) => s.timestamp > cutoff);
    this.sessionSignals.set(userId, filtered);

    // Update scores
    this.updateSessionScores(userId, signal);
  }

  /** Update session-based scores with recency weighting */
  private updateSessionScores(userId: string, signal: SessionSignal): void {
    if (!this.userScores.has(userId)) {
      this.userScores.set(userId, new Map());
    }
    const scores = this.userScores.get(userId)!;
    const current = scores.get(signal.itemId) || 0;

    // Recency weight: exponential decay
    const now = Date.now();
    const age = (now - signal.timestamp) / 1000; // seconds
    const recencyWeight = Math.exp(-this.config.recencyDecay * age);

    scores.set(signal.itemId, current + signal.value * recencyWeight * this.config.sessionWeight);
  }

  /** Compute recency-decayed score for an item */
  computeRecencyScore(userId: string, itemId: string): number {
    const signals = this.sessionSignals.get(userId);
    if (!signals) return 0;

    let totalScore = 0;
    const now = Date.now();

    for (const signal of signals) {
      if (signal.itemId !== itemId) continue;
      const ageSeconds = (now - signal.timestamp) / 1000;
      const decay = Math.exp(-this.config.recencyDecay * ageSeconds);
      totalScore += signal.value * decay;
    }

    return totalScore;
  }

  /** Process click-stream in real-time */
  processClickStream(userId: string, itemId: string, timestamp: number): void {
    if (!this.clickHistory.has(userId)) {
      this.clickHistory.set(userId, []);
    }
    this.clickHistory.get(userId)!.push(itemId);

    // Record as signal
    this.recordSignal(userId, {
      type: 'click',
      itemId,
      value: 1,
      timestamp,
      metadata: {},
    });

    // Update bandit feedback
    this.updateBanditReward(itemId, 1);
  }

  /** Record impression (item shown but not clicked) */
  recordImpression(itemId: string): void {
    this.impressions.set(itemId, (this.impressions.get(itemId) || 0) + 1);
    // No reward for bandit
    this.updateBanditReward(itemId, 0);
  }

  /** Initialize bandit arm for an item */
  initializeBanditArm(itemId: string): void {
    if (!this.banditArms.has(itemId)) {
      this.banditArms.set(itemId, {
        itemId,
        pulls: 0,
        totalReward: 0,
        avgReward: 0,
        lastPulled: 0,
        alphaParam: 1, // Beta distribution parameter
        betaParam: 1,
      });
    }
  }

  /** Update bandit arm with reward */
  private updateBanditReward(itemId: string, reward: number): void {
    this.initializeBanditArm(itemId);
    const arm = this.banditArms.get(itemId)!;
    arm.pulls++;
    arm.totalReward += reward;
    arm.avgReward = arm.totalReward / arm.pulls;
    arm.lastPulled = Date.now();

    // Update Beta distribution parameters for Thompson sampling
    if (reward > 0) {
      arm.alphaParam += reward;
    } else {
      arm.betaParam += 1;
    }
  }

  /** Select item using epsilon-greedy strategy */
  private selectEpsilonGreedy(candidates: string[]): string {
    if (Math.random() < this.config.explorationRate) {
      // Explore: random item
      return candidates[Math.floor(Math.random() * candidates.length)]!;
    }
    // Exploit: best arm
    let bestItem = candidates[0]!;
    let bestReward = -Infinity;
    for (const itemId of candidates) {
      const arm = this.banditArms.get(itemId);
      if (arm && arm.avgReward > bestReward) {
        bestReward = arm.avgReward;
        bestItem = itemId;
      }
    }
    return bestItem;
  }

  /** Select item using UCB1 formula */
  private selectUCB1(candidates: string[]): string {
    let totalPulls = 0;
    for (const itemId of candidates) {
      const arm = this.banditArms.get(itemId);
      totalPulls += arm?.pulls || 0;
    }

    let bestItem = candidates[0]!;
    let bestUCB = -Infinity;

    for (const itemId of candidates) {
      const arm = this.banditArms.get(itemId);
      if (!arm || arm.pulls === 0) return itemId; // Explore unpulled arms

      const exploitation = arm.avgReward;
      const exploration = Math.sqrt((2 * Math.log(totalPulls + 1)) / arm.pulls);
      const ucb = exploitation + exploration;

      if (ucb > bestUCB) {
        bestUCB = ucb;
        bestItem = itemId;
      }
    }

    return bestItem;
  }

  /** Select item using Thompson Sampling (Beta distribution) */
  private selectThompson(candidates: string[]): string {
    let bestItem = candidates[0]!;
    let bestSample = -Infinity;

    for (const itemId of candidates) {
      this.initializeBanditArm(itemId);
      const arm = this.banditArms.get(itemId)!;
      // Sample from Beta(alpha, beta) distribution using approximation
      const sample = this.sampleBeta(arm.alphaParam, arm.betaParam);

      if (sample > bestSample) {
        bestSample = sample;
        bestItem = itemId;
      }
    }

    return bestItem;
  }

  /** Approximate sampling from Beta distribution using Gamma */
  private sampleBeta(alpha: number, beta: number): number {
    // Use the relationship between Beta and Gamma distributions
    const x = this.sampleGamma(alpha);
    const y = this.sampleGamma(beta);
    return x / (x + y);
  }

  /** Sample from Gamma distribution using Marsaglia method */
  private sampleGamma(shape: number): number {
    if (shape < 1) {
      return this.sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x: number;
      let v: number;
      do {
        x = this.sampleNormal();
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = Math.random();

      if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }

  /** Sample from standard normal distribution (Box-Muller) */
  private sampleNormal(): number {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /** Select an item using configured bandit strategy */
  selectItem(candidates: string[]): string {
    if (candidates.length === 0) return '';

    switch (this.config.banditStrategy) {
      case 'epsilon_greedy':
        return this.selectEpsilonGreedy(candidates);
      case 'ucb1':
        return this.selectUCB1(candidates);
      case 'thompson':
        return this.selectThompson(candidates);
      default:
        return this.selectEpsilonGreedy(candidates);
    }
  }

  /** Personalize recommendations in real-time based on session */
  personalize(userId: string, candidates: RecommendedItem[], topN: number = 10): RecommendedItem[] {
    const sessionScores = this.userScores.get(userId);
    if (!sessionScores || sessionScores.size === 0) return candidates.slice(0, topN);

    // Re-score candidates based on session signals
    const rescored = candidates.map((item) => {
      const sessionBoost = sessionScores.get(item.itemId) || 0;
      const recencyScore = this.computeRecencyScore(userId, item.itemId);

      // Contextual boosting
      let contextBoost = 0;
      for (const [_feature, weights] of this.contextWeights) {
        const weight = weights.get(item.itemId) || 0;
        contextBoost += weight;
      }

      const finalScore = item.score + sessionBoost * 0.3 + recencyScore * 0.2 + contextBoost * 0.1;

      return { ...item, score: Math.max(0, Math.min(1, finalScore)) };
    });

    // Sort and re-rank
    rescored.sort((a, b) => b.score - a.score);
    return rescored.slice(0, topN).map((item, idx) => ({
      ...item,
      rank: idx + 1,
      source: 'realtime_personalized',
    }));
  }

  /** Set contextual feature weights */
  setContextWeights(feature: string, weights: Map<string, number>): void {
    this.contextWeights.set(feature, weights);
  }

  /** Get session summary for a user */
  getSessionSummary(userId: string): { signalCount: number; topItems: string[]; duration: number } {
    const signals = this.sessionSignals.get(userId) || [];
    if (signals.length === 0) return { signalCount: 0, topItems: [], duration: 0 };

    const itemScores: Map<string, number> = new Map();
    for (const s of signals) {
      itemScores.set(s.itemId, (itemScores.get(s.itemId) || 0) + s.value);
    }

    const topItems = Array.from(itemScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);

    const timestamps = signals.map((s) => s.timestamp);
    const duration = Math.max(...timestamps) - Math.min(...timestamps);

    return { signalCount: signals.length, topItems, duration };
  }

  /** Get bandit statistics */
  getBanditStats(): Map<string, { pulls: number; avgReward: number; ucb: number }> {
    const stats: Map<string, { pulls: number; avgReward: number; ucb: number }> = new Map();
    let totalPulls = 0;
    for (const arm of this.banditArms.values()) {
      totalPulls += arm.pulls;
    }

    for (const [itemId, arm] of this.banditArms) {
      const ucb =
        arm.pulls > 0
          ? arm.avgReward + Math.sqrt((2 * Math.log(totalPulls + 1)) / arm.pulls)
          : Infinity;
      stats.set(itemId, { pulls: arm.pulls, avgReward: arm.avgReward, ucb });
    }
    return stats;
  }
}
