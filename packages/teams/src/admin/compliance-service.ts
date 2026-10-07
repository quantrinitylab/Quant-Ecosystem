import type { ComplianceRule, ComplianceRuleType } from '../types.js';

export interface ComplianceRuleInput {
  type: ComplianceRuleType;
  config: Record<string, unknown>;
  enabled?: boolean;
}

export interface ComplianceViolation {
  id: string;
  ruleId: string;
  orgId: string;
  action: string;
  timestamp: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export class ComplianceService {
  private rules = new Map<string, ComplianceRule[]>();
  private violations = new Map<string, ComplianceViolation[]>();

  async addRule(orgId: string, rule: ComplianceRuleInput): Promise<ComplianceRule> {
    const newRule: ComplianceRule = {
      id: crypto.randomUUID(),
      orgId,
      type: rule.type,
      config: rule.config,
      enabled: rule.enabled ?? true,
    };
    const orgRules = this.rules.get(orgId) ?? [];
    orgRules.push(newRule);
    this.rules.set(orgId, orgRules);
    return newRule;
  }

  async removeRule(orgId: string, ruleId: string): Promise<boolean> {
    const orgRules = this.rules.get(orgId) ?? [];
    const filtered = orgRules.filter((r) => r.id !== ruleId);
    if (filtered.length === orgRules.length) return false;
    this.rules.set(orgId, filtered);
    return true;
  }

  async evaluate(
    orgId: string,
    action: string,
    context: Record<string, unknown>,
  ): Promise<{ allowed: boolean; violations: string[] }> {
    const orgRules = this.rules.get(orgId) ?? [];
    const enabledRules = orgRules.filter((r) => r.enabled);
    const violatedRules: string[] = [];

    for (const rule of enabledRules) {
      if (rule.type === 'geo-restriction') {
        const restrictedRegions = (rule.config.regions as string[]) ?? [];
        const currentRegion = context.region as string;
        if (currentRegion && restrictedRegions.includes(currentRegion)) {
          violatedRules.push(rule.id);
        }
      }
      if (rule.type === 'dlp') {
        const blockedPatterns = (rule.config.patterns as string[]) ?? [];
        const content = context.content as string;
        if (content && blockedPatterns.some((p) => content.includes(p))) {
          violatedRules.push(rule.id);
        }
      }
    }

    if (violatedRules.length > 0) {
      const firstRule = violatedRules[0] as string;
      const violation: ComplianceViolation = {
        id: crypto.randomUUID(),
        ruleId: firstRule,
        orgId,
        action,
        timestamp: Date.now(),
        severity: 'medium',
      };
      const orgViolations = this.violations.get(orgId) ?? [];
      orgViolations.push(violation);
      this.violations.set(orgId, orgViolations);
    }

    return { allowed: violatedRules.length === 0, violations: violatedRules };
  }

  async getViolations(
    orgId: string,
    period?: { start: number; end: number },
  ): Promise<ComplianceViolation[]> {
    const orgViolations = this.violations.get(orgId) ?? [];
    if (!period) return orgViolations;
    return orgViolations.filter((v) => v.timestamp >= period.start && v.timestamp <= period.end);
  }

  async setRetentionPolicy(
    orgId: string,
    config: { days: number; scope: string },
  ): Promise<ComplianceRule> {
    return this.addRule(orgId, {
      type: 'retention',
      config: { retentionDays: config.days, scope: config.scope },
      enabled: true,
    });
  }
}
