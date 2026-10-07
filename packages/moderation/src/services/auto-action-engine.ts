// ============================================================================
// Moderation - Auto Action Engine
// Rule engine with conditions and automated action execution
// ============================================================================

import type { AutoRule, RuleCondition, ModerationAction, ActionLogEntry } from '../types';

interface AutoActionConfig {
  maxRulesPerAction: number;
  globalCooldownMs: number;
  maxExecutionsPerHour: number;
  enableRollback: boolean;
  dryRunMode: boolean;
}

const DEFAULT_CONFIG: AutoActionConfig = {
  maxRulesPerAction: 50,
  globalCooldownMs: 1000,
  maxExecutionsPerHour: 1000,
  enableRollback: true,
  dryRunMode: false,
};

interface EvaluationContext {
  userId: string;
  contentId?: string;
  trustScore: number;
  reportCount: number;
  accountAgeDays: number;
  previousViolations: number;
  contentScore: number;
  followerCount: number;
  isVerified: boolean;
  [key: string]: unknown;
}

interface RuleTestResult {
  ruleId: string;
  matched: boolean;
  conditionResults: { condition: RuleCondition; passed: boolean; actualValue: unknown }[];
  wouldExecuteAction: ModerationAction;
}

/**
 * AutoActionEngine - Automated moderation rule engine
 *
 * Defines and evaluates rules with configurable conditions,
 * executes moderation actions automatically, maintains audit logs,
 * and supports rollback of automated decisions.
 */
export class AutoActionEngine {
  private config: AutoActionConfig;
  private rules: Map<string, AutoRule>;
  private actionLog: Map<string, ActionLogEntry>;
  private executionHistory: Map<string, number[]>;
  private ruleCounter: number = 0;
  private lastExecutionTime: number = 0;

  constructor(config: Partial<AutoActionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rules = new Map();
    this.actionLog = new Map();
    this.executionHistory = new Map();
  }

  /** Define a new automation rule */
  async defineRule(params: {
    name: string;
    description: string;
    conditions: RuleCondition[];
    action: ModerationAction;
    priority?: number;
    cooldownMs?: number;
    maxExecutionsPerHour?: number;
  }): Promise<AutoRule> {
    this.ruleCounter++;
    const rule: AutoRule = {
      id: `rule_${Date.now()}_${this.ruleCounter}`,
      name: params.name,
      description: params.description,
      conditions: params.conditions,
      action: params.action,
      enabled: true,
      priority: params.priority || 0,
      cooldownMs: params.cooldownMs || this.config.globalCooldownMs,
      maxExecutionsPerHour: params.maxExecutionsPerHour || this.config.maxExecutionsPerHour,
      executionCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.rules.set(rule.id, rule);
    this.executionHistory.set(rule.id, []);
    return rule;
  }

  /** Evaluate all active rules against a context */
  async evaluate(
    context: EvaluationContext,
  ): Promise<{ matched: AutoRule[]; actions: ModerationAction[] }> {
    const activeRules = Array.from(this.rules.values())
      .filter((r) => r.enabled)
      .sort((a, b) => b.priority - a.priority);

    const matched: AutoRule[] = [];
    const actions: ModerationAction[] = [];

    for (const rule of activeRules) {
      if (this.isRuleOnCooldown(rule)) continue;
      if (this.isRateExceeded(rule)) continue;

      const allConditionsMet = rule.conditions.every((condition) =>
        this.evaluateCondition(condition, context),
      );

      if (allConditionsMet) {
        matched.push(rule);
        actions.push(rule.action);
      }
    }

    return { matched, actions };
  }

  /** Execute actions for matched rules */
  async executeAction(context: EvaluationContext, rule: AutoRule): Promise<ActionLogEntry> {
    if (this.config.dryRunMode) {
      return this.createLogEntry(rule, context, false);
    }

    // Check rate limits
    if (this.isRateExceeded(rule)) {
      throw new Error(`Rate limit exceeded for rule: ${rule.name}`);
    }

    // Check global cooldown
    const now = Date.now();
    if (now - this.lastExecutionTime < this.config.globalCooldownMs) {
      throw new Error('Global cooldown active - try again later');
    }

    // Execute the action
    const logEntry = this.createLogEntry(rule, context, true);
    this.actionLog.set(logEntry.id, logEntry);

    // Update rule stats
    rule.executionCount++;
    rule.lastExecutedAt = now;
    rule.updatedAt = now;
    this.lastExecutionTime = now;

    // Track execution for rate limiting
    const history = this.executionHistory.get(rule.id) || [];
    history.push(now);
    this.executionHistory.set(rule.id, history);

    return logEntry;
  }

  /** Get action log with filtering */
  async getActionLog(options?: {
    ruleId?: string;
    userId?: string;
    action?: ModerationAction;
    limit?: number;
    startDate?: number;
    endDate?: number;
  }): Promise<ActionLogEntry[]> {
    let entries = Array.from(this.actionLog.values());

    if (options?.ruleId) entries = entries.filter((e) => e.ruleId === options.ruleId);
    if (options?.userId) entries = entries.filter((e) => e.targetUserId === options.userId);
    if (options?.action) entries = entries.filter((e) => e.action === options.action);
    if (options?.startDate) entries = entries.filter((e) => e.createdAt >= options.startDate!);
    if (options?.endDate) entries = entries.filter((e) => e.createdAt <= options.endDate!);

    const limit = options?.limit || 100;
    return entries.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }

  /** Rollback a previously executed action */
  async rollback(logEntryId: string, _reason?: string): Promise<ActionLogEntry> {
    if (!this.config.enableRollback) {
      throw new Error('Rollback is not enabled');
    }

    const entry = this.actionLog.get(logEntryId);
    if (!entry) throw new Error(`Action log entry not found: ${logEntryId}`);
    if (!entry.reversible) throw new Error('This action is not reversible');
    if (entry.reversedAt) throw new Error('This action has already been reversed');

    entry.reversedAt = Date.now();
    return entry;
  }

  /** Test a rule against context without executing */
  async testRule(ruleId: string, context: EvaluationContext): Promise<RuleTestResult> {
    const rule = this.rules.get(ruleId);
    if (!rule) throw new Error(`Rule not found: ${ruleId}`);

    const conditionResults = rule.conditions.map((condition) => ({
      condition,
      passed: this.evaluateCondition(condition, context),
      actualValue: this.getFieldValue(context, condition.field),
    }));

    const matched = conditionResults.every((r) => r.passed);

    return {
      ruleId,
      matched,
      conditionResults,
      wouldExecuteAction: rule.action,
    };
  }

  /** Get all active rules */
  async getActiveRules(): Promise<AutoRule[]> {
    return Array.from(this.rules.values())
      .filter((r) => r.enabled)
      .sort((a, b) => b.priority - a.priority);
  }

  /** Enable or disable a rule */
  async toggleRule(ruleId: string, enabled: boolean): Promise<AutoRule> {
    const rule = this.rules.get(ruleId);
    if (!rule) throw new Error(`Rule not found: ${ruleId}`);
    rule.enabled = enabled;
    rule.updatedAt = Date.now();
    return rule;
  }

  /** Delete a rule */
  async deleteRule(ruleId: string): Promise<void> {
    if (!this.rules.has(ruleId)) throw new Error(`Rule not found: ${ruleId}`);
    this.rules.delete(ruleId);
    this.executionHistory.delete(ruleId);
  }

  /** Update rule conditions */
  async updateRule(
    ruleId: string,
    updates: Partial<Pick<AutoRule, 'conditions' | 'action' | 'priority' | 'cooldownMs'>>,
  ): Promise<AutoRule> {
    const rule = this.rules.get(ruleId);
    if (!rule) throw new Error(`Rule not found: ${ruleId}`);

    if (updates.conditions) rule.conditions = updates.conditions;
    if (updates.action) rule.action = updates.action;
    if (updates.priority !== undefined) rule.priority = updates.priority;
    if (updates.cooldownMs !== undefined) rule.cooldownMs = updates.cooldownMs;
    rule.updatedAt = Date.now();

    return rule;
  }

  // --- Private Methods ---

  private evaluateCondition(condition: RuleCondition, context: EvaluationContext): boolean {
    const fieldValue = this.getFieldValue(context, condition.field);
    const targetValue = condition.value;

    switch (condition.operator) {
      case 'gt':
        return Number(fieldValue) > Number(targetValue);
      case 'gte':
        return Number(fieldValue) >= Number(targetValue);
      case 'lt':
        return Number(fieldValue) < Number(targetValue);
      case 'lte':
        return Number(fieldValue) <= Number(targetValue);
      case 'eq':
        return fieldValue === targetValue;
      case 'neq':
        return fieldValue !== targetValue;
      case 'contains':
        return String(fieldValue).includes(String(targetValue));
      case 'matches':
        return new RegExp(String(targetValue)).test(String(fieldValue));
      case 'in':
        return Array.isArray(targetValue) && targetValue.includes(fieldValue);
      case 'not_in':
        return Array.isArray(targetValue) && !targetValue.includes(fieldValue);
      default:
        return false;
    }
  }

  private getFieldValue(context: EvaluationContext, field: string): unknown {
    const parts = field.split('.');
    let current: unknown = context;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  private isRuleOnCooldown(rule: AutoRule): boolean {
    if (!rule.lastExecutedAt) return false;
    return Date.now() - rule.lastExecutedAt < rule.cooldownMs;
  }

  private isRateExceeded(rule: AutoRule): boolean {
    const history = this.executionHistory.get(rule.id) || [];
    const oneHourAgo = Date.now() - 3600000;
    const recentExecutions = history.filter((t) => t > oneHourAgo);
    return recentExecutions.length >= rule.maxExecutionsPerHour;
  }

  private createLogEntry(
    rule: AutoRule,
    context: EvaluationContext,
    _executed: boolean,
  ): ActionLogEntry {
    const entry: ActionLogEntry = {
      id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ruleId: rule.id,
      targetUserId: context.userId,
      targetContentId: context.contentId,
      action: rule.action,
      reason: `Auto-action: ${rule.name} (${rule.description})`,
      automated: true,
      reversible: ['restrict', 'mute', 'warn', 'shadow_ban'].includes(rule.action),
      createdAt: Date.now(),
    };
    return entry;
  }
}
