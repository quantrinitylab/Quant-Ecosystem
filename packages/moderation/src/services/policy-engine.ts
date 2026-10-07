// ============================================================================
// Moderation - Policy Engine
// Rule + ML hybrid policy engine with per-app configurable policies
// ============================================================================

import { z } from 'zod';
import type {
  ContentCategory,
  ModerationAction,
  ModerationResult,
  PolicyConfig,
  PolicyDecision,
  PolicyRule,
  Severity,
} from '../types';

/** Zod schema for a single policy rule */
export const PolicyRuleSchema = z.object({
  category: z.enum([
    'safe',
    'nsfw',
    'violence',
    'hate_speech',
    'spam',
    'harassment',
    'self_harm',
    'misinformation',
    'copyright',
    'illegal',
    'drugs',
    'weapons',
    'profanity',
  ] as const satisfies readonly ContentCategory[]),
  threshold: z.number().min(0).max(1),
  action: z.enum([
    'approve',
    'flag',
    'remove',
    'restrict',
    'ban',
    'warn',
    'shadow_ban',
    'age_restrict',
    'mute',
  ] as const satisfies readonly ModerationAction[]),
  severity: z.enum([
    'none',
    'low',
    'medium',
    'high',
    'critical',
  ] as const satisfies readonly Severity[]),
});

/** Zod schema for a full policy config */
export const PolicySchema = z.object({
  appId: z.string().min(1),
  rules: z.array(PolicyRuleSchema),
});

/**
 * PolicyEngine - Per-app configurable policy enforcement
 *
 * Evaluates classification results against application-specific
 * policies with configurable thresholds, actions, and severity levels.
 */
export class PolicyEngine {
  private policies: Map<string, PolicyConfig>;

  constructor(policies: PolicyConfig[] = []) {
    this.policies = new Map();
    for (const policy of policies) {
      const validated = PolicySchema.parse(policy);
      this.policies.set(validated.appId, validated);
    }
  }

  /** Evaluate a classification result against app-specific policies */
  evaluate(classificationResult: ModerationResult, appId: string): PolicyDecision {
    const policy = this.policies.get(appId);
    if (!policy) {
      return {
        action: classificationResult.action,
        severity: 'none',
        matchedRules: [],
        confidence: classificationResult.confidence,
      };
    }

    const matchedRules: PolicyRule[] = [];
    let highestSeverityAction: ModerationAction = 'approve';
    let highestSeverity: Severity = 'none';
    const severityOrder: Severity[] = ['none', 'low', 'medium', 'high', 'critical'];

    for (const rule of policy.rules) {
      const categoryScore = classificationResult.categories.find(
        (c) => c.category === rule.category,
      );

      if (categoryScore && categoryScore.score >= rule.threshold) {
        matchedRules.push(rule);

        const ruleSeverityIndex = severityOrder.indexOf(rule.severity);
        const currentSeverityIndex = severityOrder.indexOf(highestSeverity);

        if (ruleSeverityIndex > currentSeverityIndex) {
          highestSeverity = rule.severity;
          highestSeverityAction = rule.action;
        }
      }
    }

    return {
      action: matchedRules.length > 0 ? highestSeverityAction : 'approve',
      severity: highestSeverity,
      matchedRules,
      confidence: classificationResult.confidence,
    };
  }

  /** Add a new policy for an app */
  addPolicy(policy: PolicyConfig): void {
    const validated = PolicySchema.parse(policy);
    this.policies.set(validated.appId, validated);
  }

  /** Remove a policy by app ID */
  removePolicy(appId: string): boolean {
    return this.policies.delete(appId);
  }

  /** Get policy for a specific app */
  getPolicy(appId: string): PolicyConfig | undefined {
    return this.policies.get(appId);
  }
}
