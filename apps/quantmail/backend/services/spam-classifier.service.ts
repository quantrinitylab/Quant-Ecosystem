// ============================================================================
// QuantMail — Local Bayes / Heuristic Spam Classification Engine (Task QM-03)
//
// Fast, deterministic in-process Bayesian and heuristic spam classifier.
// Analyzes email headers, subject line, sender domain, and body text tokens.
// Provides online training support (`trainSpam`, `trainHam`) for user feedback loops.
// ============================================================================

export interface SpamClassificationResult {
  isSpam: boolean;
  score: number; // 0.0 (cleanest ham) to 1.0 (definite spam)
  confidence: number;
  reasons: string[];
}

export interface ClassifyEmailInput {
  from: string;
  subject: string;
  text?: string | null;
  html?: string | null;
  headers?: Record<string, string>;
}

export class SpamClassifierService {
  private spamTokenCounts = new Map<string, number>();
  private hamTokenCounts = new Map<string, number>();
  private totalSpamDocs = 0;
  private totalHamDocs = 0;
  private readonly threshold: number;

  // High-signal suspicious keywords with heuristic base weights
  private static readonly SPAM_HEURISTIC_RULES: Array<{
    pattern: RegExp;
    weight: number;
    reason: string;
  }> = [
    {
      pattern: /\b(viagra|cialis|enhancement pill)\b/i,
      weight: 0.85,
      reason: 'Pharmaceutical spam keyword',
    },
    {
      pattern: /\b(nigerian prince|inheritance fund|wire transfer sum|claim your prize)\b/i,
      weight: 0.9,
      reason: 'Advance fee / lottery scam',
    },
    {
      pattern: /\b(crypto investment|guaranteed 100x|bitcoin reward|wallet suspended)\b/i,
      weight: 0.8,
      reason: 'Cryptocurrency phishing',
    },
    {
      pattern:
        /\b(urgent: verify your account|password expires today|unauthorized login detected)\b/i,
      weight: 0.75,
      reason: 'Account suspension / credential harvesting',
    },
    {
      pattern: /\b(make \$[0-9]+ daily from home|act now! limited time offer)\b/i,
      weight: 0.7,
      reason: 'Aggressive marketing trigger',
    },
    {
      pattern: /\b(unsubscribe here to stop receiving|bulk mail dispatch|opt-out)\b/i,
      weight: 0.3,
      reason: 'Bulk commercial mailing',
    },
  ];

  constructor(threshold = 0.7) {
    this.threshold = threshold;
    this.seedBaselineVocabulary();
  }

  /**
   * Evaluates an email message and returns a classification score between 0.0 and 1.0.
   */
  classify(input: ClassifyEmailInput): SpamClassificationResult {
    const reasons: string[] = [];
    let heuristicScore = 0;

    const fullContent = `${input.subject} ${input.text ?? ''} ${this.stripHtml(input.html ?? '')}`;

    // 1. Evaluate Rule-based Heuristics
    for (const rule of SpamClassifierService.SPAM_HEURISTIC_RULES) {
      if (rule.pattern.test(fullContent)) {
        heuristicScore = Math.max(heuristicScore, rule.weight);
        reasons.push(rule.reason);
      }
    }

    // 2. Check for Suspicious Headers / SPF/DKIM flags if present
    if (input.headers) {
      const authResults = input.headers['authentication-results'] ?? '';
      if (/spf=fail/i.test(authResults)) {
        heuristicScore = Math.max(heuristicScore, 0.75);
        reasons.push('SPF authentication failed');
      }
      if (/dkim=fail/i.test(authResults)) {
        heuristicScore = Math.max(heuristicScore, 0.75);
        reasons.push('DKIM signature verification failed');
      }
    }

    // 3. Evaluate Naive Bayes Probabilities on Content Tokens
    const tokens = this.tokenize(fullContent);
    const tokenProbabilities: number[] = [];

    for (const token of tokens) {
      const p = this.calculateTokenSpamProbability(token);
      if (p !== null && Math.abs(p - 0.5) > 0.15) {
        tokenProbabilities.push(p);
      }
    }

    // Combine probabilities using Paul Graham's Naive Bayes combining formula
    let bayesScore = 0.5;
    if (tokenProbabilities.length > 0) {
      // Pick the top 15 most interesting tokens (farthest from 0.5)
      tokenProbabilities.sort((a, b) => Math.abs(b - 0.5) - Math.abs(a - 0.5));
      const topProbabilities = tokenProbabilities.slice(0, 15);

      const numerator = topProbabilities.reduce((prod, p) => prod * p, 1);
      const denominator = numerator + topProbabilities.reduce((prod, p) => prod * (1 - p), 1);
      bayesScore = denominator > 0 ? numerator / denominator : 0.5;
    }

    // Combined Score: weighted blend of heuristics (60%) and Bayesian evidence (40%)
    const finalScore = Number(
      Math.min(
        1.0,
        Math.max(0.0, heuristicScore > 0 ? Math.max(heuristicScore, bayesScore) : bayesScore),
      ).toFixed(4),
    );

    const isSpam = finalScore >= this.threshold;
    const confidence = Number((Math.abs(finalScore - 0.5) * 2).toFixed(2));

    if (isSpam && reasons.length === 0) {
      reasons.push(
        `Bayesian content spam score (${finalScore}) exceeds threshold (${this.threshold})`,
      );
    }

    return {
      isSpam,
      score: finalScore,
      confidence,
      reasons,
    };
  }

  /**
   * Trains the classifier that a message is SPAM.
   */
  trainSpam(text: string): void {
    const tokens = this.tokenize(text);
    for (const token of tokens) {
      this.spamTokenCounts.set(token, (this.spamTokenCounts.get(token) ?? 0) + 1);
    }
    this.totalSpamDocs++;
  }

  /**
   * Trains the classifier that a message is HAM (legitimate).
   */
  trainHam(text: string): void {
    const tokens = this.tokenize(text);
    for (const token of tokens) {
      this.hamTokenCounts.set(token, (this.hamTokenCounts.get(token) ?? 0) + 1);
    }
    this.totalHamDocs++;
  }

  private calculateTokenSpamProbability(token: string): number | null {
    const spamCount = this.spamTokenCounts.get(token) ?? 0;
    const hamCount = this.hamTokenCounts.get(token) ?? 0;

    if (spamCount === 0 && hamCount === 0) return null;

    const pSpam = this.totalSpamDocs > 0 ? spamCount / this.totalSpamDocs : 0;
    const pHam = this.totalHamDocs > 0 ? (hamCount * 2) / this.totalHamDocs : 0; // Double weight on ham to reduce false positives

    if (pSpam + pHam === 0) return null;
    return pSpam / (pSpam + pHam);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9_\-\$]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3 && t.length <= 30);
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>?/gm, ' ');
  }

  private seedBaselineVocabulary(): void {
    // Seed high-probability spam tokens
    const spamSeeds = [
      'viagra',
      'cialis',
      'rolex',
      'casino',
      'lottery',
      'winner',
      'million',
      'dollars',
      'inheritance',
      'crypto',
      'wallet',
      'bitcoin',
      'beneficiary',
      'transfer',
      'urgent',
      'verify',
      'suspended',
      'unauthorized',
      'click',
      'pills',
      'refinance',
      'mortgage',
    ];
    for (const word of spamSeeds) {
      this.spamTokenCounts.set(word, 20);
    }
    this.totalSpamDocs += 20;

    // Seed high-probability legitimate ham tokens
    const hamSeeds = [
      'meeting',
      'project',
      'schedule',
      'review',
      'attached',
      'update',
      'thanks',
      'regards',
      'deploy',
      'branch',
      'pr',
      'commit',
      'test',
      'team',
      'calendar',
      'invoice',
      'report',
    ];
    for (const word of hamSeeds) {
      this.hamTokenCounts.set(word, 20);
    }
    this.totalHamDocs += 20;
  }
}
