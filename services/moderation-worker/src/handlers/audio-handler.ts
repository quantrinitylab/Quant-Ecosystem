// ============================================================================
// Moderation Worker - Audio Handler
// Transcribes audio to text, then classifies via TextClassifier
// ============================================================================

import type { TextClassifier, PolicyEngine, ModerationResult } from '@quant/moderation';
import type { ModerationJob } from '@quant/queue';
import type { ActionExecutor } from '../action-executor';

export interface TranscriptionService {
  transcribe(audioUrl: string): Promise<string>;
}

export interface AudioHandlerDeps {
  transcriptionService: TranscriptionService;
  textClassifier: TextClassifier;
  policyEngine: PolicyEngine;
  actionExecutor: ActionExecutor;
}

export class AudioModerationHandler {
  private readonly transcriptionService: TranscriptionService;
  private readonly textClassifier: TextClassifier;
  private readonly policyEngine: PolicyEngine;
  private readonly actionExecutor: ActionExecutor;

  constructor(deps: AudioHandlerDeps) {
    this.transcriptionService = deps.transcriptionService;
    this.textClassifier = deps.textClassifier;
    this.policyEngine = deps.policyEngine;
    this.actionExecutor = deps.actionExecutor;
  }

  async handle(job: ModerationJob): Promise<ModerationResult> {
    // Transcribe audio to text
    const transcript = await this.transcriptionService.transcribe(job.content);

    // Classify transcribed text
    const classificationResult = await this.textClassifier.classify(transcript, job.contentId);

    // Override content type to audio in the result
    const audioResult: ModerationResult = {
      ...classificationResult,
      contentType: 'audio',
      metadata: {
        ...classificationResult.metadata,
        transcriptLength: transcript.length,
        originalUrl: job.content,
      },
    };

    const policyDecision = this.policyEngine.evaluate(audioResult, job.appId);

    if (policyDecision.action !== 'approve') {
      await this.actionExecutor.execute({
        action: policyDecision.action,
        contentId: job.contentId,
        userId: job.userId,
        severity: policyDecision.severity,
        reason: `Audio transcript policy matched: ${policyDecision.matchedRules.map((r) => r.category).join(', ')}`,
        classificationResult: audioResult,
      });
    }

    return {
      ...audioResult,
      action: policyDecision.action,
    };
  }
}
