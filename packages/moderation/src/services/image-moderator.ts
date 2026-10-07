// ============================================================================
// Moderation - Image Moderator
// ML-based image moderation with perceptual hash matching
// ============================================================================

import type {
  ImageModerationAPIClient,
  ImageModerationInput,
  ModerationResult,
  CSAMMatcherInterface,
} from '../types';
import { ImageClassifier } from './image-classifier';
import { PerceptualHasher } from './perceptual-hash';
import { CSAMMatchService } from './csam-matcher';

/**
 * ImageModerator - Image content moderation
 *
 * Combines ML-based classification via ImageClassifier with
 * perceptual hash matching for known-bad content detection.
 */
export class ImageModerator {
  private classifier: ImageClassifier;
  private hasher: PerceptualHasher;
  private csamMatcher: CSAMMatcherInterface | undefined;
  private csamMatchService: CSAMMatchService | undefined;
  private knownBadHashes: Map<string, string>;

  constructor(params: {
    client: ImageModerationAPIClient;
    csamMatcher?: CSAMMatcherInterface;
    csamMatchService?: CSAMMatchService;
  }) {
    this.classifier = new ImageClassifier(params.client);
    this.hasher = new PerceptualHasher();
    this.csamMatcher = params.csamMatcher;
    this.csamMatchService = params.csamMatchService;
    this.knownBadHashes = new Map();
  }

  /** Moderate an image by URL or base64 */
  async moderate(input: ImageModerationInput, contentId?: string): Promise<ModerationResult> {
    return this.classifier.classify(input, contentId);
  }

  /** Moderate an image buffer with perceptual hash checking */
  async moderateWithHash(
    buffer: Buffer,
    input: ImageModerationInput,
    contentId?: string,
  ): Promise<ModerationResult> {
    const hash = this.hasher.computeImageHash(buffer);

    // Check CSAMMatchService first (new provider-based approach, Phase 20)
    if (this.csamMatchService) {
      const csamResult = await this.csamMatchService.checkHash(hash);
      if (csamResult.matched) {
        return {
          id: `imgmod_csam_${Date.now()}`,
          contentId: contentId ?? `image_${Date.now()}`,
          contentType: 'image',
          categories: [{ category: 'illegal', score: 1, confidence: 0.99, detected: true }],
          overallScore: 1,
          action: 'remove',
          confidence: 0.99,
          automated: true,
          flags: ['illegal', 'csam_match'],
          metadata: { reportId: csamResult.reportId },
          createdAt: Date.now(),
        };
      }
    } else if (this.csamMatcher) {
      // Legacy CSAMGuard path (backward compatibility)
      const csamResult = await this.csamMatcher.checkHash(hash);
      if (csamResult.matched) {
        return {
          id: `imgmod_csam_${Date.now()}`,
          contentId: contentId ?? `image_${Date.now()}`,
          contentType: 'image',
          categories: [{ category: 'illegal', score: 1, confidence: 0.99, detected: true }],
          overallScore: 1,
          action: 'remove',
          confidence: 0.99,
          automated: true,
          flags: ['illegal', 'csam_match'],
          metadata: { reportId: csamResult.reportId },
          createdAt: Date.now(),
        };
      }
    }

    // Check known-bad hashes
    for (const [knownHash, category] of this.knownBadHashes) {
      if (this.hasher.isNearDuplicate(hash, knownHash)) {
        return {
          id: `imgmod_hash_${Date.now()}`,
          contentId: contentId ?? `image_${Date.now()}`,
          contentType: 'image',
          categories: [{ category: 'nsfw', score: 0.95, confidence: 0.98, detected: true }],
          overallScore: 0.95,
          action: 'remove',
          confidence: 0.98,
          automated: true,
          flags: [category],
          metadata: { matchedHash: knownHash },
          createdAt: Date.now(),
        };
      }
    }

    // Fall back to ML classification
    return this.classifier.classify(input, contentId);
  }

  /** Add a hash to the known-bad list */
  addKnownBadHash(hash: string, category: string): void {
    this.knownBadHashes.set(hash, category);
  }

  /** Get the perceptual hasher */
  getHasher(): PerceptualHasher {
    return this.hasher;
  }
}
