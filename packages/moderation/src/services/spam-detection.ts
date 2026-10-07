// ============================================================================
// Moderation - Spam Detection Service
// Rate limiting, duplicate detection, link spam, and new account burst detection
// ============================================================================

import type { SpamCheckResult, SpamSignal, SpamVerdict } from '../types';

interface SpamDetectionConfig {
  rateWindowMs: number;
  maxMessagesInWindow: number;
  similarityThreshold: number;
  maxLinksPerMessage: number;
  newAccountWindowMs: number;
  newAccountMaxMessages: number;
}

const DEFAULT_CONFIG: SpamDetectionConfig = {
  rateWindowMs: 60_000, // 1 minute
  maxMessagesInWindow: 10,
  similarityThreshold: 0.8,
  maxLinksPerMessage: 5,
  newAccountWindowMs: 86_400_000, // 24 hours
  newAccountMaxMessages: 5,
};

interface UserMessageRecord {
  content: string;
  timestamp: number;
}

/**
 * SpamDetectionService - Multi-signal spam detection
 *
 * Detects spam through rate limiting, duplicate/similar content detection,
 * link spam (excessive URLs, known-bad domains), and new account burst patterns.
 */
export class SpamDetectionService {
  private config: SpamDetectionConfig;
  private userMessages: Map<string, UserMessageRecord[]>;
  private badDomains: Set<string>;
  private userSpamScores: Map<string, number>;

  constructor(config: Partial<SpamDetectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.userMessages = new Map();
    this.badDomains = new Set();
    this.userSpamScores = new Map();
  }

  /** Check content for spam signals */
  checkContent(params: {
    userId: string;
    content: string;
    accountCreatedAt: number;
    messageTimestamp?: number;
  }): SpamCheckResult {
    const { userId, content, accountCreatedAt, messageTimestamp = Date.now() } = params;
    const signals: SpamSignal[] = [];

    // Rate limiting check
    const rateSignal = this.checkRateLimit(userId, messageTimestamp);
    if (rateSignal) signals.push(rateSignal);

    // Duplicate/similar content check
    const duplicateSignal = this.checkDuplicateContent(userId, content);
    if (duplicateSignal) signals.push(duplicateSignal);

    // Link spam check
    const linkSignal = this.checkLinkSpam(content);
    if (linkSignal) signals.push(linkSignal);

    // New account burst check
    const burstSignal = this.checkNewAccountBurst(userId, accountCreatedAt, messageTimestamp);
    if (burstSignal) signals.push(burstSignal);

    // Calculate verdict
    const confidence = this.calculateConfidence(signals);
    const verdict = this.determineVerdict(signals, confidence);

    // Update spam score
    const currentScore = this.userSpamScores.get(userId) || 0;
    this.userSpamScores.set(userId, currentScore + signals.length * 10);

    return { verdict, confidence, signals };
  }

  /** Record a message for rate tracking */
  recordMessage(userId: string, content: string): void {
    const records = this.userMessages.get(userId) || [];
    records.push({ content, timestamp: Date.now() });

    // Keep last 100 messages per user
    if (records.length > 100) {
      records.splice(0, records.length - 100);
    }

    this.userMessages.set(userId, records);
  }

  /** Add a domain to the bad domain list */
  addBadDomain(domain: string): void {
    this.badDomains.add(domain.toLowerCase());
  }

  /** Get accumulated spam score for a user */
  getUserSpamScore(userId: string): number {
    return this.userSpamScores.get(userId) || 0;
  }

  /** Reset a user's spam state */
  reset(userId: string): void {
    this.userMessages.delete(userId);
    this.userSpamScores.delete(userId);
  }

  // --- Private Methods ---

  private checkRateLimit(userId: string, currentTimestamp: number): SpamSignal | null {
    const records = this.userMessages.get(userId) || [];
    const windowStart = currentTimestamp - this.config.rateWindowMs;
    const recentMessages = records.filter((r) => r.timestamp >= windowStart);

    if (recentMessages.length >= this.config.maxMessagesInWindow) {
      return {
        type: 'rate_limit',
        confidence: Math.min(1, recentMessages.length / this.config.maxMessagesInWindow),
        description: `${recentMessages.length} messages in ${this.config.rateWindowMs}ms window (max: ${this.config.maxMessagesInWindow})`,
      };
    }

    return null;
  }

  private checkDuplicateContent(userId: string, content: string): SpamSignal | null {
    const records = this.userMessages.get(userId) || [];
    if (records.length === 0) return null;

    const contentWords = this.getWordSet(content);

    for (const record of records) {
      const similarity = this.jaccardSimilarity(contentWords, this.getWordSet(record.content));
      if (similarity >= this.config.similarityThreshold) {
        return {
          type: 'duplicate_content',
          confidence: similarity,
          description: `Content similarity ${(similarity * 100).toFixed(0)}% with previous message`,
        };
      }
    }

    return null;
  }

  private checkLinkSpam(content: string): SpamSignal | null {
    const urlPattern = /https?:\/\/[^\s]+/gi;
    const urls = content.match(urlPattern) || [];

    if (urls.length > this.config.maxLinksPerMessage) {
      return {
        type: 'link_spam',
        confidence: Math.min(1, urls.length / (this.config.maxLinksPerMessage * 2)),
        description: `${urls.length} links found (max: ${this.config.maxLinksPerMessage})`,
      };
    }

    // Check for bad domains
    for (const url of urls) {
      try {
        const domain = new URL(url).hostname.toLowerCase();
        if (this.badDomains.has(domain)) {
          return {
            type: 'link_spam',
            confidence: 0.95,
            description: `Known bad domain detected: ${domain}`,
          };
        }
      } catch {
        // Invalid URL, skip
      }
    }

    return null;
  }

  private checkNewAccountBurst(
    userId: string,
    accountCreatedAt: number,
    currentTimestamp: number,
  ): SpamSignal | null {
    const accountAge = currentTimestamp - accountCreatedAt;
    if (accountAge > this.config.newAccountWindowMs) return null;

    const records = this.userMessages.get(userId) || [];
    if (records.length >= this.config.newAccountMaxMessages) {
      return {
        type: 'new_account_burst',
        confidence: Math.min(1, records.length / (this.config.newAccountMaxMessages * 2)),
        description: `New account (${Math.round(accountAge / 3600000)}h old) with ${records.length} messages`,
      };
    }

    return null;
  }

  private getWordSet(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 0),
    );
  }

  private jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
    if (setA.size === 0 && setB.size === 0) return 1;
    const intersection = new Set([...setA].filter((x) => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return intersection.size / union.size;
  }

  private calculateConfidence(signals: SpamSignal[]): number {
    if (signals.length === 0) return 0;
    const maxConfidence = Math.max(...signals.map((s) => s.confidence));
    const avgConfidence = signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length;
    return (maxConfidence + avgConfidence) / 2;
  }

  private determineVerdict(signals: SpamSignal[], confidence: number): SpamVerdict {
    if (signals.length === 0) return 'clean';
    if (signals.length >= 2 || confidence >= 0.8) return 'spam';
    return 'suspicious';
  }
}
