// ============================================================================
// Moderation - Content Classifier
// Unified classifier delegating to TextClassifier or ImageClassifier
// ============================================================================

import type {
  ContentType,
  ModerationResult,
  ModerationAPIClient,
  ImageModerationAPIClient,
  ImageModerationInput,
} from '../types';
import { TextClassifier } from './text-classifier';
import { ImageClassifier } from './image-classifier';

/**
 * ContentClassifier - Unified content classification facade
 *
 * Delegates to TextClassifier or ImageClassifier based on content type.
 * Provides a single entry point for all content moderation.
 */
export class ContentClassifier {
  private textClassifier: TextClassifier;
  private imageClassifier: ImageClassifier;

  constructor(params: { textClient: ModerationAPIClient; imageClient: ImageModerationAPIClient }) {
    this.textClassifier = new TextClassifier(params.textClient);
    this.imageClassifier = new ImageClassifier(params.imageClient);
  }

  /** Classify content based on its type */
  async classify(
    contentId: string,
    content: string | ImageModerationInput,
    contentType: ContentType = 'text',
  ): Promise<ModerationResult> {
    if (contentType === 'image') {
      const input: ImageModerationInput = typeof content === 'string' ? { url: content } : content;
      return this.imageClassifier.classify(input, contentId);
    }

    // Default to text classification
    const text = typeof content === 'string' ? content : '';
    return this.textClassifier.classify(text, contentId);
  }

  /** Get the underlying text classifier */
  getTextClassifier(): TextClassifier {
    return this.textClassifier;
  }

  /** Get the underlying image classifier */
  getImageClassifier(): ImageClassifier {
    return this.imageClassifier;
  }
}
