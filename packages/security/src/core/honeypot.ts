// ============================================================================
// Security Package - Honeypot Detector
// ============================================================================

import crypto from 'node:crypto';
import type { HoneypotConfig, BotDetectionResult, BotSignal } from '../types';

/** Default honeypot configuration */
const DEFAULT_CONFIG: HoneypotConfig = {
  hiddenFields: ['_hp_name', '_hp_email', '_hp_url', '_hp_phone', '_hp_address'],
  minSubmitTime: 2000,
  maxSubmitTime: 600000,
  trapEndpoints: ['/api/admin-login', '/api/wp-admin', '/api/.env', '/api/config.php'],
  jsChallenge: true,
  scoringThreshold: 60,
};

/**
 * HoneypotDetector - Bot detection using hidden fields, timing analysis,
 * trap endpoints, JavaScript challenges, and behavioral scoring.
 */
export class HoneypotDetector {
  private config: HoneypotConfig;
  private formTimestamps: Map<string, number>;
  private trapHits: Map<string, { ip: string; timestamp: number; endpoint: string }[]>;
  private jsChallenges: Map<string, { challenge: string; answer: string; issued: number }>;
  private detectionLog: BotDetectionResult[];
  private ipScores: Map<string, number>;

  constructor(config: Partial<HoneypotConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.formTimestamps = new Map();
    this.trapHits = new Map();
    this.jsChallenges = new Map();
    this.detectionLog = [];
    this.ipScores = new Map();
  }

  /** Analyze a form submission for bot indicators */
  async analyzeSubmission(params: {
    formId: string;
    ip: string;
    fields: Record<string, string>;
    submitTime: number;
    userAgent: string;
    headers: Record<string, string>;
    jsEnabled?: boolean;
  }): Promise<BotDetectionResult> {
    const signals: BotSignal[] = [];
    let totalScore = 0;

    // 1. Hidden field detection (honeypot fields)
    const hiddenFieldScore = this.checkHiddenFields(params.fields);
    if (hiddenFieldScore > 0) {
      signals.push({
        type: 'honeypot_field_filled',
        weight: hiddenFieldScore,
        description: 'Hidden honeypot fields were filled - strong bot indicator',
      });
      totalScore += hiddenFieldScore;
    }

    // 2. Timing analysis
    const timingScore = this.checkTiming(params.formId, params.submitTime);
    if (timingScore > 0) {
      signals.push({
        type: 'suspicious_timing',
        weight: timingScore,
        description:
          timingScore > 30
            ? 'Form submitted too quickly (bot speed)'
            : 'Form submitted too slowly (automated retry)',
      });
      totalScore += timingScore;
    }

    // 3. User agent analysis
    const uaScore = this.analyzeUserAgent(params.userAgent);
    if (uaScore > 0) {
      signals.push({
        type: 'suspicious_user_agent',
        weight: uaScore,
        description: 'User agent matches known bot patterns',
      });
      totalScore += uaScore;
    }

    // 4. Header analysis
    const headerScore = this.analyzeHeaders(params.headers);
    if (headerScore > 0) {
      signals.push({
        type: 'missing_headers',
        weight: headerScore,
        description: 'Missing standard browser headers',
      });
      totalScore += headerScore;
    }

    // 5. JavaScript challenge check
    if (this.config.jsChallenge && !params.jsEnabled) {
      const jsScore = 25;
      signals.push({
        type: 'js_disabled',
        weight: jsScore,
        description: 'JavaScript not executed - likely bot',
      });
      totalScore += jsScore;
    }

    // 6. IP reputation check
    const ipHistory = this.ipScores.get(params.ip) || 0;
    if (ipHistory > 30) {
      signals.push({
        type: 'repeat_offender',
        weight: 15,
        description: 'IP has previous bot detection history',
      });
      totalScore += 15;
    }

    // Determine action based on total score
    const isBot = totalScore >= this.config.scoringThreshold;
    let action: 'allow' | 'challenge' | 'block';
    if (totalScore >= 80) {
      action = 'block';
    } else if (totalScore >= this.config.scoringThreshold) {
      action = 'challenge';
    } else {
      action = 'allow';
    }

    const result: BotDetectionResult = {
      isBot,
      score: Math.min(100, totalScore),
      signals,
      action,
    };

    // Update IP score
    this.ipScores.set(params.ip, ipHistory + (isBot ? 20 : -5));

    // Log detection
    this.detectionLog.push(result);

    return result;
  }

  /** Record form load time for timing analysis */
  recordFormLoad(formId: string): void {
    this.formTimestamps.set(formId, Date.now());
  }

  /** Check trap endpoint hit */
  async checkTrapEndpoint(endpoint: string, ip: string): Promise<BotDetectionResult> {
    const isTrap = this.config.trapEndpoints.some((trap) =>
      endpoint.toLowerCase().includes(trap.toLowerCase()),
    );

    if (isTrap) {
      // Record trap hit
      const hits = this.trapHits.get(ip) || [];
      hits.push({ ip, timestamp: Date.now(), endpoint });
      this.trapHits.set(ip, hits);

      // Immediately flag as bot
      const result: BotDetectionResult = {
        isBot: true,
        score: 100,
        signals: [
          {
            type: 'trap_endpoint',
            weight: 100,
            description: `Accessed trap endpoint: ${endpoint}`,
          },
        ],
        action: 'block',
      };

      this.detectionLog.push(result);
      this.ipScores.set(ip, (this.ipScores.get(ip) || 0) + 50);
      return result;
    }

    return { isBot: false, score: 0, signals: [], action: 'allow' };
  }

  /** Generate a JavaScript challenge */
  generateJSChallenge(_sessionId: string): { challengeScript: string; challengeId: string } {
    const a = crypto.randomInt(1, 101);
    const b = crypto.randomInt(1, 101);
    const answer = (a * b + a - b).toString();
    const challengeId = `jsc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    this.jsChallenges.set(challengeId, {
      challenge: `${a},${b}`,
      answer,
      issued: Date.now(),
    });

    // Generate obfuscated JavaScript that computes the answer
    const challengeScript = `(function(){var _a=${a},_b=${b};document.getElementById('_js_token').value=(_a*_b+_a-_b).toString();})();`;

    return { challengeScript, challengeId };
  }

  /** Verify JavaScript challenge response */
  verifyJSChallenge(challengeId: string, response: string): boolean {
    const challenge = this.jsChallenges.get(challengeId);
    if (!challenge) return false;

    // Check expiry (5 minutes)
    if (Date.now() - challenge.issued > 300000) {
      this.jsChallenges.delete(challengeId);
      return false;
    }

    const valid = challenge.answer === response;
    this.jsChallenges.delete(challengeId);
    return valid;
  }

  /** Check hidden honeypot fields */
  private checkHiddenFields(fields: Record<string, string>): number {
    let score = 0;
    for (const fieldName of this.config.hiddenFields) {
      if (fields[fieldName] && fields[fieldName].trim().length > 0) {
        score += 40; // Each filled honeypot field is a strong signal
      }
    }
    return Math.min(100, score);
  }

  /** Check form submission timing */
  private checkTiming(formId: string, submitTime: number): number {
    const loadTime = this.formTimestamps.get(formId);
    if (!loadTime) return 0;

    const elapsed = submitTime - loadTime;

    // Too fast (less than minimum)
    if (elapsed < this.config.minSubmitTime) {
      // Extremely fast = definite bot
      if (elapsed < 500) return 40;
      return 25;
    }

    // Too slow (more than maximum - could be automated retry)
    if (elapsed > this.config.maxSubmitTime) {
      return 10;
    }

    return 0;
  }

  /** Analyze user agent for bot patterns */
  private analyzeUserAgent(userAgent: string): number {
    if (!userAgent || userAgent.length === 0) return 30;

    const botPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scraper/i,
      /headless/i,
      /phantom/i,
      /selenium/i,
      /puppeteer/i,
      /curl/i,
      /wget/i,
      /python-requests/i,
      /go-http-client/i,
      /httpclient/i,
      /java\//i,
      /libwww/i,
    ];

    for (const pattern of botPatterns) {
      if (pattern.test(userAgent)) return 35;
    }

    // Very short user agent
    if (userAgent.length < 20) return 15;

    return 0;
  }

  /** Analyze request headers */
  private analyzeHeaders(headers: Record<string, string>): number {
    let score = 0;

    // Missing typical browser headers
    if (!headers['accept-language']) score += 10;
    if (!headers['accept-encoding']) score += 5;
    if (!headers['accept']) score += 5;
    if (!headers['connection']) score += 3;

    // Suspicious header combinations
    if (headers['x-forwarded-for'] && !headers['accept-language']) {
      score += 10;
    }

    return score;
  }

  /** Get detection log */
  getDetectionLog(): BotDetectionResult[] {
    return [...this.detectionLog];
  }

  /** Get IP score */
  getIPScore(ip: string): number {
    return this.ipScores.get(ip) || 0;
  }

  /** Reset IP score */
  resetIPScore(ip: string): void {
    this.ipScores.delete(ip);
  }

  /** Get statistics */
  getStats(): { totalDetections: number; botsDetected: number; trapHits: number } {
    const botsDetected = this.detectionLog.filter((d) => d.isBot).length;
    let trapHitCount = 0;
    for (const hits of this.trapHits.values()) {
      trapHitCount += hits.length;
    }
    return {
      totalDetections: this.detectionLog.length,
      botsDetected,
      trapHits: trapHitCount,
    };
  }
}
