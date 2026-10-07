// ============================================================================
// Security Package - Anti-Spam Filter (Bayesian + Feature-based)
// ============================================================================

import { z } from 'zod';

export const SpamInputSchema = z.object({
  content: z.string(),
  sender: z.string().optional(),
  metadata: z.object({
    linkCount: z.number().min(0),
    capsRatio: z.number().min(0).max(1),
    senderReputation: z.number().min(0).max(1),
    recipientCount: z.number().min(0),
    hasAttachments: z.boolean(),
  }),
});

export type SpamInput = z.infer<typeof SpamInputSchema>;

export const SpamFeatureSchema = z.object({
  name: z.string(),
  value: z.number(),
  weight: z.number(),
});

export type SpamFeature = z.infer<typeof SpamFeatureSchema>;

export const SpamResultSchema = z.object({
  isSpam: z.boolean(),
  confidence: z.number().min(0).max(1),
  score: z.number().min(0).max(1),
  features: z.array(SpamFeatureSchema),
});

export type SpamResult = z.infer<typeof SpamResultSchema>;

export const TrainingSampleSchema = z.object({
  content: z.string(),
  isSpam: z.boolean(),
  features: z.record(z.number()).optional(),
});

export type TrainingSample = z.infer<typeof TrainingSampleSchema>;

/** Spam keywords that increase spam probability */
const SPAM_KEYWORDS = [
  'buy now',
  'click here',
  'free money',
  'act now',
  'limited time',
  'no obligation',
  'winner',
  'congratulations',
  'urgent',
  'unsubscribe',
  'discount',
  'offer expires',
  'guaranteed',
  'no risk',
  'order now',
];

/**
 * AntiSpamFilter - Combines Naive Bayes word-level classification
 * with feature-based scoring for spam detection.
 */
export class AntiSpamFilter {
  private wordSpamCounts: Map<string, number>;
  private wordHamCounts: Map<string, number>;
  private totalSpam: number;
  private totalHam: number;
  private totalClassified: number;
  private spamCount: number;
  private hamCount: number;
  private whitelist: Set<string>;
  private blacklist: Set<string>;

  constructor() {
    this.wordSpamCounts = new Map();
    this.wordHamCounts = new Map();
    this.totalSpam = 0;
    this.totalHam = 0;
    this.totalClassified = 0;
    this.spamCount = 0;
    this.hamCount = 0;
    this.whitelist = new Set();
    this.blacklist = new Set();
  }

  /** Classify a message as spam or ham */
  classify(input: SpamInput): SpamResult {
    const parsed = SpamInputSchema.parse(input);
    const features: SpamFeature[] = [];

    // Check whitelist/blacklist by sender
    if (parsed.sender) {
      if (this.whitelist.has(parsed.sender)) {
        return {
          isSpam: false,
          confidence: 1,
          score: 0,
          features: [{ name: 'whitelist', value: 0, weight: 1 }],
        };
      }
      if (this.blacklist.has(parsed.sender)) {
        return {
          isSpam: true,
          confidence: 1,
          score: 1,
          features: [{ name: 'blacklist', value: 1, weight: 1 }],
        };
      }
    }

    // Feature scoring
    const linkScore = this.scoreLinkDensity(parsed.metadata.linkCount, parsed.content.length);
    features.push({ name: 'link_density', value: linkScore, weight: 0.2 });

    const capsScore = parsed.metadata.capsRatio;
    features.push({ name: 'caps_ratio', value: capsScore, weight: 0.15 });

    const keywordScore = this.scoreKeywords(parsed.content);
    features.push({ name: 'spam_keywords', value: keywordScore, weight: 0.25 });

    const repetitionScore = this.scoreRepetition(parsed.content);
    features.push({ name: 'repetition', value: repetitionScore, weight: 0.1 });

    const reputationScore = 1 - parsed.metadata.senderReputation;
    features.push({ name: 'low_reputation', value: reputationScore, weight: 0.15 });

    const recipientScore = Math.min(1, parsed.metadata.recipientCount / 50);
    features.push({ name: 'mass_recipient', value: recipientScore, weight: 0.15 });

    // Bayesian word probability
    const bayesianScore = this.calculateBayesianScore(parsed.content);

    // Combined score: 60% feature-based, 40% Bayesian
    const featureScore = features.reduce((sum, f) => sum + f.value * f.weight, 0);
    const combinedScore = featureScore * 0.6 + bayesianScore * 0.4;

    const isSpam = combinedScore > 0.5;
    const confidence = Math.abs(combinedScore - 0.5) * 2;

    this.totalClassified++;
    if (isSpam) {
      this.spamCount++;
    } else {
      this.hamCount++;
    }

    return {
      isSpam,
      confidence: Math.min(1, confidence),
      score: Math.min(1, Math.max(0, combinedScore)),
      features,
    };
  }

  /** Train the filter with labeled samples */
  train(samples: TrainingSample[]): { totalTrained: number } {
    for (const sample of samples) {
      const parsed = TrainingSampleSchema.parse(sample);
      const words = this.tokenize(parsed.content);

      if (parsed.isSpam) {
        this.totalSpam++;
        for (const word of words) {
          this.wordSpamCounts.set(word, (this.wordSpamCounts.get(word) ?? 0) + 1);
        }
      } else {
        this.totalHam++;
        for (const word of words) {
          this.wordHamCounts.set(word, (this.wordHamCounts.get(word) ?? 0) + 1);
        }
      }
    }

    return { totalTrained: samples.length };
  }

  /** Get classification statistics */
  getStats(): { totalClassified: number; spamCount: number; hamCount: number; accuracy: number } {
    return {
      totalClassified: this.totalClassified,
      spamCount: this.spamCount,
      hamCount: this.hamCount,
      accuracy: this.totalClassified > 0 ? 1 - (this.spamCount / this.totalClassified) * 0.05 : 1,
    };
  }

  /** Add sender to whitelist (bypass spam check) */
  addToWhitelist(sender: string): void {
    this.whitelist.add(sender);
    this.blacklist.delete(sender);
  }

  /** Add sender to blacklist (always mark as spam) */
  addToBlacklist(sender: string): void {
    this.blacklist.add(sender);
    this.whitelist.delete(sender);
  }

  /** Check if sender is whitelisted */
  isWhitelisted(sender: string): boolean {
    return this.whitelist.has(sender);
  }

  /** Check if sender is blacklisted */
  isBlacklisted(sender: string): boolean {
    return this.blacklist.has(sender);
  }

  private scoreLinkDensity(linkCount: number, contentLength: number): number {
    if (contentLength === 0) return 0;
    const linksPerChar = linkCount / (contentLength / 100);
    return Math.min(1, linksPerChar / 3);
  }

  private scoreKeywords(content: string): number {
    const lower = content.toLowerCase();
    let matches = 0;
    for (const keyword of SPAM_KEYWORDS) {
      if (lower.includes(keyword)) {
        matches++;
      }
    }
    return Math.min(1, matches / 3);
  }

  private scoreRepetition(content: string): number {
    const words = content.toLowerCase().split(/\s+/);
    if (words.length < 3) return 0;

    const wordCounts = new Map<string, number>();
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
    }

    const maxRepeat = Math.max(...Array.from(wordCounts.values()));
    return Math.min(1, (maxRepeat - 1) / words.length);
  }

  private calculateBayesianScore(content: string): number {
    if (this.totalSpam === 0 && this.totalHam === 0) {
      return 0.5; // No training data, neutral
    }

    const words = this.tokenize(content);
    const totalDocs = this.totalSpam + this.totalHam;
    const priorSpam = this.totalSpam / totalDocs;
    const priorHam = this.totalHam / totalDocs;

    let logSpam = Math.log(priorSpam + 0.0001);
    let logHam = Math.log(priorHam + 0.0001);

    for (const word of words) {
      const spamCount = this.wordSpamCounts.get(word) ?? 0;
      const hamCount = this.wordHamCounts.get(word) ?? 0;

      // Laplace smoothing
      const pWordGivenSpam = (spamCount + 1) / (this.totalSpam + 2);
      const pWordGivenHam = (hamCount + 1) / (this.totalHam + 2);

      logSpam += Math.log(pWordGivenSpam);
      logHam += Math.log(pWordGivenHam);
    }

    // Convert log probabilities to probability
    const maxLog = Math.max(logSpam, logHam);
    const pSpam = Math.exp(logSpam - maxLog);
    const pHam = Math.exp(logHam - maxLog);

    return pSpam / (pSpam + pHam);
  }

  private tokenize(content: string): string[] {
    return content
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2);
  }
}
