// ============================================================================
// Moderation Worker - Image Handler
// Classifies images and checks perceptual hashes against known-bad list
// ============================================================================

import type {
  ImageClassifier,
  PerceptualHasher,
  PolicyEngine,
  ModerationResult,
} from '@quant/moderation';
import { CSAMMatchService } from '@quant/moderation';
import type { ModerationJob } from '@quant/queue';
import type { ActionExecutor } from '../action-executor';

/** Interface for fetching image content from a URL */
export interface ContentFetcher {
  fetch(url: string): Promise<Buffer>;
}

export interface ImageHandlerDeps {
  classifier: ImageClassifier;
  hasher: PerceptualHasher;
  policyEngine: PolicyEngine;
  actionExecutor: ActionExecutor;
  knownBadHashes?: Set<string>;
  contentFetcher?: ContentFetcher;
  csamMatchService?: CSAMMatchService;
}

export class ImageModerationHandler {
  private readonly classifier: ImageClassifier;
  private readonly hasher: PerceptualHasher;
  private readonly policyEngine: PolicyEngine;
  private readonly actionExecutor: ActionExecutor;
  private readonly knownBadHashes: Set<string>;
  private readonly contentFetcher: ContentFetcher | null;
  private readonly csamMatchService: CSAMMatchService | undefined;

  constructor(deps: ImageHandlerDeps) {
    this.classifier = deps.classifier;
    this.hasher = deps.hasher;
    this.policyEngine = deps.policyEngine;
    this.actionExecutor = deps.actionExecutor;
    this.knownBadHashes = deps.knownBadHashes ?? new Set();
    this.contentFetcher = deps.contentFetcher ?? null;
    this.csamMatchService = deps.csamMatchService;
  }

  async handle(job: ModerationJob): Promise<ModerationResult> {
    // Fetch actual image bytes for hashing. If a ContentFetcher is available
    // and the content looks like a URL, fetch the image. Otherwise fall back
    // to hashing whatever content bytes are available (e.g. inline base64).
    let imageBytes: Buffer;
    if (this.contentFetcher && this.isUrl(job.content)) {
      try {
        imageBytes = await this.contentFetcher.fetch(job.content);
      } catch {
        // If fetch fails, fall back to hashing the raw content string
        imageBytes = Buffer.from(job.content);
      }
    } else {
      imageBytes = Buffer.from(job.content);
    }

    const imageHash = this.hasher.computeImageHash(imageBytes);

    // CSAM hash check BEFORE any storage or classification (Phase 20)
    // Fail-closed: ANY error (including timeout) results in removal.
    if (this.csamMatchService) {
      let csamMatched = false;
      let csamReportId: string | undefined;
      let csamFlags: string[] = ['illegal', 'csam_match'];

      try {
        const csamResult = await this.csamMatchService.checkHash(imageHash);
        csamMatched = csamResult.matched;
        csamReportId = csamResult.reportId;
      } catch {
        // Fail-closed: timeout or any provider error blocks the upload
        csamMatched = true;
        csamFlags = ['csam_check_failed'];
      }

      if (csamMatched) {
        const csamBlockResult: ModerationResult = {
          id: `imgmod_csam_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          contentId: job.contentId,
          contentType: 'image',
          categories: [{ category: 'illegal', score: 1.0, confidence: 0.99, detected: true }],
          overallScore: 1.0,
          action: 'remove',
          confidence: 0.99,
          automated: true,
          flags: csamFlags,
          metadata: {
            hash: imageHash,
            reportId: csamReportId,
            matchType: csamFlags.includes('csam_check_failed')
              ? 'csam_check_failed'
              : 'csam_provider',
          },
          createdAt: Date.now(),
        };

        await this.actionExecutor.execute({
          action: 'remove',
          contentId: job.contentId,
          userId: job.userId,
          severity: 'critical',
          reason: csamFlags.includes('csam_check_failed')
            ? 'CSAM check failed (fail-closed) - upload blocked'
            : 'CSAM hash match detected by provider',
          classificationResult: csamBlockResult,
        });

        return csamBlockResult;
      }
    }

    // Check against known-bad hashes
    if (this.knownBadHashes.has(imageHash)) {
      const immediateResult: ModerationResult = {
        id: `imgmod_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        contentId: job.contentId,
        contentType: 'image',
        categories: [{ category: 'nsfw', score: 1.0, confidence: 1.0, detected: true }],
        overallScore: 1.0,
        action: 'remove',
        confidence: 1.0,
        automated: true,
        flags: ['known_bad_hash'],
        metadata: { hash: imageHash, matchType: 'known_bad' },
        createdAt: Date.now(),
      };

      await this.actionExecutor.execute({
        action: 'remove',
        contentId: job.contentId,
        userId: job.userId,
        severity: 'critical',
        reason: 'Known-bad perceptual hash match',
        classificationResult: immediateResult,
      });

      return immediateResult;
    }

    // Classify via ML
    const classificationResult = await this.classifier.classify(
      { url: job.content },
      job.contentId,
    );

    const policyDecision = this.policyEngine.evaluate(classificationResult, job.appId);

    if (policyDecision.action !== 'approve') {
      await this.actionExecutor.execute({
        action: policyDecision.action,
        contentId: job.contentId,
        userId: job.userId,
        severity: policyDecision.severity,
        reason: `Image policy matched: ${policyDecision.matchedRules.map((r) => r.category).join(', ')}`,
        classificationResult,
      });
    }

    return {
      ...classificationResult,
      action: policyDecision.action,
    };
  }

  private isUrl(content: string): boolean {
    return content.startsWith('http://') || content.startsWith('https://');
  }
}
