// ============================================================================
// Moderation - Text Classifier
// ML-based text classification via OpenAI moderation API
// ============================================================================

import type {
  ModerationAPIClient,
  TextModerationResponse,
  ModerationResult,
  CategoryScore,
  ModerationScoreCard,
} from '../types';
import {
  determineAction,
  DEFAULT_CLASSIFIER_THRESHOLDS,
  type ClassifierThresholds,
} from './classifier-thresholds';

/**
 * TextClassifier - ML-based text content classification
 *
 * Delegates classification to an external moderation API (e.g., OpenAI)
 * via the ModerationAPIClient interface. Maps API responses to internal
 * ModerationResult format for consistent downstream processing.
 */
export class TextClassifier {
  private readonly client: ModerationAPIClient;
  private readonly thresholds: ClassifierThresholds;
  private lastResponse: TextModerationResponse | null = null;

  constructor(client: ModerationAPIClient, thresholds?: Partial<ClassifierThresholds>) {
    this.client = client;
    this.thresholds = { ...DEFAULT_CLASSIFIER_THRESHOLDS, ...thresholds };
  }

  /** Classify text content using ML API */
  async classify(text: string, contentId?: string): Promise<ModerationResult> {
    const response = await this.client.moderateText(text);
    this.lastResponse = response;
    const categories = this.mapResponseToCategories(response);
    const overallScore = Math.max(...categories.map((c) => c.score), 0);
    const action = determineAction(categories, this.thresholds);

    return {
      id: `txtcls_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      contentId: contentId ?? `content_${Date.now()}`,
      contentType: 'text',
      categories,
      overallScore,
      action,
      confidence: this.calculateConfidence(categories),
      automated: true,
      flags: categories.filter((c) => c.detected).map((c) => c.category),
      metadata: { textLength: text.length, classifier: 'ml-api' },
      createdAt: Date.now(),
    };
  }

  /**
   * Map an API response to a full ModerationScoreCard with all 7 categories.
   *
   * @param response - The TextModerationResponse to map. If omitted, falls back
   *   to the last response from classify().
   * @deprecated Calling without a response parameter relies on mutable lastResponse
   *   state and is not safe for concurrent use. Always pass the response explicitly.
   */
  mapToScoreCard(response?: TextModerationResponse): ModerationScoreCard {
    const r = response ?? this.lastResponse;
    if (!r) {
      return {
        toxicity: 0,
        hate: 0,
        harassment: 0,
        sexualMinor: 0,
        violenceExplicit: 0,
        selfHarm: 0,
        spam: 0,
      };
    }

    // Toxicity is derived as the max of hate + harassment scores
    const toxicity = Math.max(r.hate.score, r.harassment.score, r.violence.score);

    return {
      toxicity,
      hate: r.hate.score,
      harassment: r.harassment.score,
      sexualMinor: r.sexualMinors?.score ?? r.sexual.score * 0.5,
      violenceExplicit: r.threatOfViolence?.score ?? r.violence.score,
      selfHarm: r.selfHarm.score,
      spam: r.spam?.score ?? 0,
    };
  }

  private mapResponseToCategories(response: TextModerationResponse): CategoryScore[] {
    return [
      {
        category: 'hate_speech',
        score: response.hate.score,
        confidence: this.scoreToConfidence(response.hate.score),
        detected: response.hate.flagged,
      },
      {
        category: 'harassment',
        score: response.harassment.score,
        confidence: this.scoreToConfidence(response.harassment.score),
        detected: response.harassment.flagged,
      },
      {
        category: 'self_harm',
        score: response.selfHarm.score,
        confidence: this.scoreToConfidence(response.selfHarm.score),
        detected: response.selfHarm.flagged,
      },
      {
        category: 'nsfw',
        score: response.sexual.score,
        confidence: this.scoreToConfidence(response.sexual.score),
        detected: response.sexual.flagged,
      },
      {
        category: 'violence',
        score: response.violence.score,
        confidence: this.scoreToConfidence(response.violence.score),
        detected: response.violence.flagged,
      },
    ];
  }

  private scoreToConfidence(score: number): number {
    // High scores or very low scores indicate high confidence
    if (score >= 0.8 || score <= 0.1) return 0.95;
    if (score >= 0.6 || score <= 0.2) return 0.85;
    return 0.7;
  }

  private calculateConfidence(categories: CategoryScore[]): number {
    const detected = categories.filter((c) => c.detected);
    if (detected.length === 0) return 0.95;
    return detected.reduce((sum, c) => sum + c.confidence, 0) / detected.length;
  }
}
