// ============================================================================
// Moderation Worker - Text Handler
// Classifies text content and applies policy decisions
// ============================================================================

import type { TextClassifier, PolicyEngine, ModerationResult } from '@quant/moderation';
import type { ModerationJob } from '@quant/queue';
import type { ActionExecutor } from '../action-executor';

export interface TextHandlerDeps {
  classifier: TextClassifier;
  policyEngine: PolicyEngine;
  actionExecutor: ActionExecutor;
}

export class TextModerationHandler {
  private readonly classifier: TextClassifier;
  private readonly policyEngine: PolicyEngine;
  private readonly actionExecutor: ActionExecutor;

  constructor(deps: TextHandlerDeps) {
    this.classifier = deps.classifier;
    this.policyEngine = deps.policyEngine;
    this.actionExecutor = deps.actionExecutor;
  }

  async handle(job: ModerationJob): Promise<ModerationResult> {
    const classificationResult = await this.classifier.classify(job.content, job.contentId);
    const policyDecision = this.policyEngine.evaluate(classificationResult, job.appId);

    if (policyDecision.action !== 'approve') {
      await this.actionExecutor.execute({
        action: policyDecision.action,
        contentId: job.contentId,
        userId: job.userId,
        severity: policyDecision.severity,
        reason: `Policy matched: ${policyDecision.matchedRules.map((r) => r.category).join(', ')}`,
        classificationResult,
      });
    }

    return {
      ...classificationResult,
      action: policyDecision.action,
    };
  }
}
