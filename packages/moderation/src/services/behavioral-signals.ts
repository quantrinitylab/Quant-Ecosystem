// ============================================================================
// Moderation - Behavioral Signal Analyzer
// Risk scoring based on account age, typing cadence, mouse entropy, sessions
// ============================================================================

import type {
  BehavioralSignals,
  BehavioralRiskScore,
  BehavioralRiskFactor,
  HumanLikenessResult,
} from '../types';

interface BehavioralSignalConfig {
  newAccountThresholdDays: number;
  suspiciousTypingWpm: number;
  minMouseEntropy: number;
  maxMouseEntropy: number;
  minSessionCount: number;
}

const DEFAULT_CONFIG: BehavioralSignalConfig = {
  newAccountThresholdDays: 7,
  suspiciousTypingWpm: 200,
  minMouseEntropy: 0.2,
  maxMouseEntropy: 0.95,
  minSessionCount: 3,
};

/**
 * BehavioralSignalAnalyzer - Combines behavioral signals into risk scores
 *
 * Analyzes:
 * - Account age (< 7 days = risky)
 * - Typing speed (> 200 WPM = suspicious / bot-like)
 * - Mouse entropy (too uniform = bot, too random = noise)
 * - Session count (low session count = less established)
 */
export class BehavioralSignalAnalyzer {
  private config: BehavioralSignalConfig;

  constructor(config: Partial<BehavioralSignalConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Analyze an account and produce a risk score */
  analyzeAccount(userId: string, signals: BehavioralSignals): BehavioralRiskScore {
    void userId;
    const factors: BehavioralRiskFactor[] = [];

    // Account age factor
    const ageFactor = this.scoreAccountAge(signals.accountAgeDays);
    factors.push(ageFactor);

    // Typing speed factor
    if (signals.typingSpeedWpm !== undefined) {
      const typingFactor = this.scoreTypingSpeed(signals.typingSpeedWpm);
      factors.push(typingFactor);
    }

    // Mouse entropy factor
    if (signals.mouseEntropy !== undefined) {
      const mouseFactor = this.scoreMouseEntropy(signals.mouseEntropy);
      factors.push(mouseFactor);
    }

    // Session count factor
    const sessionFactor = this.scoreSessionCount(signals.sessionCount);
    factors.push(sessionFactor);

    // Calculate overall score (0-100)
    const totalScore = factors.reduce((sum, f) => sum + f.score, 0);
    const score = Math.min(100, Math.round(totalScore / factors.length));

    const classification = this.classify(score);

    return { score, factors, classification };
  }

  /** Assess whether behavioral signals indicate a human user */
  isHumanLike(signals: BehavioralSignals): HumanLikenessResult {
    const factors: { name: string; passed: boolean; detail: string }[] = [];

    // Typing speed check
    if (signals.typingSpeedWpm !== undefined) {
      const typingOk = signals.typingSpeedWpm <= this.config.suspiciousTypingWpm;
      factors.push({
        name: 'typing_speed',
        passed: typingOk,
        detail: typingOk
          ? `Typing speed ${signals.typingSpeedWpm} WPM is within normal range`
          : `Typing speed ${signals.typingSpeedWpm} WPM exceeds human threshold`,
      });
    }

    // Mouse entropy check
    if (signals.mouseEntropy !== undefined) {
      const entropyOk =
        signals.mouseEntropy >= this.config.minMouseEntropy &&
        signals.mouseEntropy <= this.config.maxMouseEntropy;
      factors.push({
        name: 'mouse_entropy',
        passed: entropyOk,
        detail: entropyOk
          ? `Mouse entropy ${signals.mouseEntropy.toFixed(2)} is within human range`
          : `Mouse entropy ${signals.mouseEntropy.toFixed(2)} is outside human range`,
      });
    }

    // Session count check
    const sessionsOk = signals.sessionCount >= this.config.minSessionCount;
    factors.push({
      name: 'session_count',
      passed: sessionsOk,
      detail: sessionsOk
        ? `Session count ${signals.sessionCount} indicates established usage`
        : `Session count ${signals.sessionCount} is unusually low`,
    });

    // Account age check
    const ageOk = signals.accountAgeDays >= this.config.newAccountThresholdDays;
    factors.push({
      name: 'account_age',
      passed: ageOk,
      detail: ageOk
        ? `Account is ${signals.accountAgeDays} days old (established)`
        : `Account is only ${signals.accountAgeDays} days old (new)`,
    });

    const passedCount = factors.filter((f) => f.passed).length;
    const confidence = passedCount / factors.length;

    return { confidence, factors };
  }

  // --- Private methods ---

  private scoreAccountAge(days: number): BehavioralRiskFactor {
    let score: number;
    if (days < 1) {
      score = 90;
    } else if (days < 3) {
      score = 70;
    } else if (days < this.config.newAccountThresholdDays) {
      score = 50;
    } else if (days < 30) {
      score = 20;
    } else {
      score = 5;
    }

    return {
      name: 'account_age',
      score,
      description: `Account is ${days} days old`,
    };
  }

  private scoreTypingSpeed(wpm: number): BehavioralRiskFactor {
    let score: number;
    if (wpm > this.config.suspiciousTypingWpm * 2) {
      score = 95;
    } else if (wpm > this.config.suspiciousTypingWpm) {
      score = 70;
    } else if (wpm > 150) {
      score = 30;
    } else {
      score = 5;
    }

    return {
      name: 'typing_speed',
      score,
      description: `Typing speed is ${wpm} WPM`,
    };
  }

  private scoreMouseEntropy(entropy: number): BehavioralRiskFactor {
    let score: number;
    if (entropy < this.config.minMouseEntropy) {
      // Too uniform - likely bot
      score = 80;
    } else if (entropy > this.config.maxMouseEntropy) {
      // Too random - likely noise/injection
      score = 60;
    } else {
      // Normal human range
      score = 5;
    }

    return {
      name: 'mouse_entropy',
      score,
      description: `Mouse movement entropy is ${entropy.toFixed(3)}`,
    };
  }

  private scoreSessionCount(count: number): BehavioralRiskFactor {
    let score: number;
    if (count <= 1) {
      score = 60;
    } else if (count < this.config.minSessionCount) {
      score = 40;
    } else if (count < 10) {
      score = 15;
    } else {
      score = 5;
    }

    return {
      name: 'session_count',
      score,
      description: `User has ${count} sessions`,
    };
  }

  private classify(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score <= 25) return 'low';
    if (score <= 50) return 'medium';
    if (score <= 75) return 'high';
    return 'critical';
  }
}
