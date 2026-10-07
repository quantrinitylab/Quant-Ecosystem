import { SafetyLevel } from './types.js';
import type { SafetyClassificationResult } from './types.js';

export interface SafetyRule {
  id: string;
  description: string;
  check: (action: string, context: Record<string, unknown>) => boolean;
  level: SafetyLevel;
}

const SEVERITY_RANK: Record<SafetyLevel, number> = {
  [SafetyLevel.Safe]: 0,
  [SafetyLevel.Caution]: 1,
  [SafetyLevel.Blocked]: 2,
};

export class SafetyClassifier {
  private rules: SafetyRule[] = [];

  constructor() {
    this.initializeDefaultRules();
  }

  private initializeDefaultRules(): void {
    this.rules.push({
      id: 'PII_WITHOUT_CONSENT',
      description: 'Block PII access without user consent',
      check: (_action: string, context: Record<string, unknown>) => {
        return context['piiAccess'] === true && context['consent'] === false;
      },
      level: SafetyLevel.Blocked,
    });

    this.rules.push({
      id: 'FINANCIAL_HIGH_VALUE',
      description: 'Caution for high-value financial actions',
      check: (action: string, context: Record<string, unknown>) => {
        const isFinancial =
          action.toLowerCase().includes('payment') || action.toLowerCase().includes('transfer');
        const amount = typeof context['amount'] === 'number' ? context['amount'] : 0;
        return isFinancial && amount > 1000;
      },
      level: SafetyLevel.Caution,
    });

    this.rules.push({
      id: 'ADMIN_ACTION',
      description: 'Caution for admin-level actions',
      check: (action: string, _context: Record<string, unknown>) => {
        const actionLower = action.toLowerCase();
        return (
          actionLower.includes('delete_account') ||
          actionLower.includes('change_role') ||
          actionLower.includes('billing')
        );
      },
      level: SafetyLevel.Caution,
    });

    this.rules.push({
      id: 'MODERATION_OVERRIDE',
      description: 'Block moderation override attempts',
      check: (action: string, _context: Record<string, unknown>) => {
        return action.toLowerCase().includes('override_moderation');
      },
      level: SafetyLevel.Blocked,
    });

    this.rules.push({
      id: 'BULK_ACTION',
      description: 'Caution for bulk actions affecting many records',
      check: (_action: string, context: Record<string, unknown>) => {
        const count = typeof context['affectedCount'] === 'number' ? context['affectedCount'] : 0;
        return count > 100;
      },
      level: SafetyLevel.Caution,
    });
  }

  addRule(rule: SafetyRule): void {
    this.rules.push(rule);
  }

  removeRule(ruleId: string): void {
    this.rules = this.rules.filter((r) => r.id !== ruleId);
  }

  getRules(): SafetyRule[] {
    return [...this.rules];
  }

  /**
   * Classify the safety level of an action given its context.
   *
   * The following context keys are inspected by the default rules:
   * - `piiAccess` (boolean): Whether the action accesses personally identifiable information.
   * - `consent` (boolean): Whether user consent has been granted for PII access.
   * - `amount` (number): Monetary amount for financial actions (triggers caution above 1000).
   * - `affectedCount` (number): Number of records affected by bulk actions (triggers caution above 100).
   *
   * Callers should inject these keys into the context before calling classify.
   * Use {@link enrichContext} to document and prepare domain-specific metadata.
   */
  classify(action: string, context: Record<string, unknown>): SafetyClassificationResult {
    const triggeredRules: string[] = [];
    let highestLevel = SafetyLevel.Safe;

    for (const rule of this.rules) {
      if (rule.check(action, context)) {
        triggeredRules.push(rule.id);
        if (SEVERITY_RANK[rule.level] > SEVERITY_RANK[highestLevel]) {
          highestLevel = rule.level;
        }
      }
    }

    const reason =
      triggeredRules.length > 0
        ? `Triggered rules: ${triggeredRules.join(', ')}`
        : 'No rules triggered';

    return {
      level: highestLevel,
      reason,
      rules_triggered: triggeredRules,
    };
  }

  /**
   * Prepare context for safety classification by merging tool arguments with safety-relevant
   * metadata from the caller's domain. This is the extension point for injecting signals from
   * identity-permissions (consent status, PII flags) or other systems.
   *
   * Currently returns args unchanged. When identity-permissions integration is wired in,
   * this method will look up consent, resource ownership, and PII flags automatically.
   */
  enrichContext(args: Record<string, unknown>): Record<string, unknown> {
    return args;
  }
}
