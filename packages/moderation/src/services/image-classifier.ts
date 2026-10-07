// ============================================================================
// Moderation - Image Classifier
// ML-based image classification via moderation API
// ============================================================================

import type {
  ImageModerationAPIClient,
  ImageModerationInput,
  ImageModerationResponse,
  ModerationResult,
  CategoryScore,
} from '../types';
import {
  determineAction,
  DEFAULT_CLASSIFIER_THRESHOLDS,
  type ClassifierThresholds,
} from './classifier-thresholds';

/**
 * ImageClassifier - ML-based image content classification
 *
 * Delegates image classification to an external moderation API
 * via the ImageModerationAPIClient interface. Supports both URL
 * and base64 image inputs.
 */
export class ImageClassifier {
  private readonly client: ImageModerationAPIClient;
  private readonly thresholds: ClassifierThresholds;

  constructor(client: ImageModerationAPIClient, thresholds?: Partial<ClassifierThresholds>) {
    this.client = client;
    this.thresholds = { ...DEFAULT_CLASSIFIER_THRESHOLDS, ...thresholds };
  }

  /** Classify an image using the ML API */
  async classify(input: ImageModerationInput, contentId?: string): Promise<ModerationResult> {
    if (!input.url && !input.base64) {
      throw new Error('Either url or base64 must be provided');
    }

    const response = await this.client.moderateImage(input);
    const categories = this.mapResponseToCategories(response);
    const overallScore = Math.max(...categories.map((c) => c.score), 0);
    const action = determineAction(categories, this.thresholds);

    return {
      id: `imgcls_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      contentId: contentId ?? `image_${Date.now()}`,
      contentType: 'image',
      categories,
      overallScore,
      action,
      confidence: this.calculateConfidence(categories),
      automated: true,
      flags: categories.filter((c) => c.detected).map((c) => c.category),
      metadata: {
        inputType: input.url ? 'url' : 'base64',
        classifier: 'ml-api',
      },
      createdAt: Date.now(),
    };
  }

  private mapResponseToCategories(response: ImageModerationResponse): CategoryScore[] {
    return [
      {
        category: 'nsfw',
        score: response.nsfw.score,
        confidence: this.scoreToConfidence(response.nsfw.score),
        detected: response.nsfw.flagged,
      },
      {
        category: 'violence',
        score: response.violence.score,
        confidence: this.scoreToConfidence(response.violence.score),
        detected: response.violence.flagged,
      },
      {
        category: 'hate_speech',
        score: response.hateSymbols.score,
        confidence: this.scoreToConfidence(response.hateSymbols.score),
        detected: response.hateSymbols.flagged,
      },
      {
        category: 'self_harm',
        score: response.selfHarm.score,
        confidence: this.scoreToConfidence(response.selfHarm.score),
        detected: response.selfHarm.flagged,
      },
    ];
  }

  private scoreToConfidence(score: number): number {
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
