// ============================================================================
// Moderation - Text Moderator
// ML-based text moderation delegating to TextClassifier
// ============================================================================

import type { ModerationAPIClient, ModerationResult } from '../types';
import { TextClassifier } from './text-classifier';

/**
 * TextModerator - Text content moderation
 *
 * Thin facade delegating to TextClassifier for ML-based moderation.
 */
export class TextModerator {
  private classifier: TextClassifier;

  constructor(client: ModerationAPIClient) {
    this.classifier = new TextClassifier(client);
  }

  /** Moderate text content */
  async moderate(text: string, contentId?: string): Promise<ModerationResult> {
    return this.classifier.classify(text, contentId);
  }
}
