// ============================================================================
// Moderation Worker - Video Handler
// Extracts keyframes via KeyframeExtractor and classifies each via ImageClassifier
// ============================================================================

import type {
  ImageClassifier,
  PolicyEngine,
  ModerationResult,
  CategoryScore,
  KeyframeExtractor,
} from '@quant/moderation';
import type { ModerationJob } from '@quant/queue';
import type { ActionExecutor } from '../action-executor';

export interface VideoHandlerDeps {
  imageClassifier: ImageClassifier;
  keyframeExtractor: KeyframeExtractor;
  policyEngine: PolicyEngine;
  actionExecutor: ActionExecutor;
}

export class VideoModerationHandler {
  private readonly imageClassifier: ImageClassifier;
  private readonly keyframeExtractor: KeyframeExtractor;
  private readonly policyEngine: PolicyEngine;
  private readonly actionExecutor: ActionExecutor;

  constructor(deps: VideoHandlerDeps) {
    this.imageClassifier = deps.imageClassifier;
    this.keyframeExtractor = deps.keyframeExtractor;
    this.policyEngine = deps.policyEngine;
    this.actionExecutor = deps.actionExecutor;
  }

  async handle(job: ModerationJob): Promise<ModerationResult> {
    // Extract duration from job metadata (default 60s if not provided)
    const duration = (job as unknown as { duration?: number }).duration ?? 60;

    // Extract keyframes using the real extractor (tiered intervals)
    const keyframes = await this.keyframeExtractor.extract(job.content, duration);

    // Classify each extracted frame
    const frameResults: ModerationResult[] = [];
    for (const frame of keyframes) {
      const input = frame.buffer
        ? { base64: frame.buffer.toString('base64') }
        : { url: frame.framePath ?? job.content };
      const result = await this.imageClassifier.classify(input, job.contentId);
      frameResults.push(result);
    }

    // Aggregate results: worst score wins
    const aggregated = this.aggregateResults(frameResults, job.contentId);
    const policyDecision = this.policyEngine.evaluate(aggregated, job.appId);

    if (policyDecision.action !== 'approve') {
      await this.actionExecutor.execute({
        action: policyDecision.action,
        contentId: job.contentId,
        userId: job.userId,
        severity: policyDecision.severity,
        reason: `Video frame policy matched: ${policyDecision.matchedRules.map((r) => r.category).join(', ')}`,
        classificationResult: aggregated,
      });
    }

    return {
      ...aggregated,
      action: policyDecision.action,
    };
  }

  private aggregateResults(results: ModerationResult[], contentId: string): ModerationResult {
    if (results.length === 0) {
      return {
        id: `vidmod_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        contentId,
        contentType: 'video',
        categories: [],
        overallScore: 0,
        action: 'approve',
        confidence: 1.0,
        automated: true,
        flags: [],
        metadata: { framesAnalyzed: 0 },
        createdAt: Date.now(),
      };
    }

    // Take worst score per category across all frames
    const categoryMap = new Map<string, CategoryScore>();
    for (const result of results) {
      for (const cat of result.categories) {
        const existing = categoryMap.get(cat.category);
        if (!existing || cat.score > existing.score) {
          categoryMap.set(cat.category, cat);
        }
      }
    }

    const categories = Array.from(categoryMap.values());
    const overallScore = Math.max(...categories.map((c) => c.score), 0);
    const worstResult = results.reduce((worst, r) =>
      r.overallScore > worst.overallScore ? r : worst,
    );

    return {
      id: `vidmod_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      contentId,
      contentType: 'video',
      categories,
      overallScore,
      action: worstResult.action,
      confidence: worstResult.confidence,
      automated: true,
      flags: categories.filter((c) => c.detected).map((c) => c.category),
      metadata: { framesAnalyzed: results.length },
      createdAt: Date.now(),
    };
  }
}
