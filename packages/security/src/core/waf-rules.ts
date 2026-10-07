// ============================================================================
// Security Package - WAF Rule Engine
// ============================================================================

import type { WAFDecision, WAFRule, WAFRequest, BlockedRequestStats } from '../types';

/** Built-in WAF rules based on OWASP Core Rule Set patterns */
const BUILTIN_RULES: WAFRule[] = [
  {
    id: 'WAF-001',
    name: 'SQL Injection - Union Select',
    pattern: '(?:union\\s+(?:all\\s+)?select|select\\s+.*from\\s+)',
    target: 'body',
    action: 'block',
    severity: 'critical',
    enabled: true,
  },
  {
    id: 'WAF-002',
    name: 'SQL Injection - Comments and Operators',
    pattern: "(?:'\\s*(?:or|and)\\s+['\"]?\\d|--\\s*$|/\\*.*\\*/)",
    target: 'body',
    action: 'block',
    severity: 'critical',
    enabled: true,
  },
  {
    id: 'WAF-003',
    name: 'XSS - Script Tags',
    pattern: '(?:<script[^>]*>|javascript\\s*:|on\\w+\\s*=)',
    target: 'body',
    action: 'block',
    severity: 'high',
    enabled: true,
  },
  {
    id: 'WAF-004',
    name: 'XSS - Event Handlers',
    pattern: '(?:onerror|onload|onclick|onmouseover|onfocus)\\s*=',
    target: 'body',
    action: 'block',
    severity: 'high',
    enabled: true,
  },
  {
    id: 'WAF-005',
    name: 'Path Traversal',
    pattern: '(?:\\.\\.[\\\\/]|%2e%2e[%2f%5c])',
    target: 'uri',
    action: 'block',
    severity: 'high',
    enabled: true,
  },
  {
    id: 'WAF-006',
    name: 'Command Injection',
    pattern: '(?:[;&|`]\\s*(?:cat|ls|rm|wget|curl|bash|sh|python|perl|nc)\\b)',
    target: 'body',
    action: 'block',
    severity: 'critical',
    enabled: true,
  },
  {
    id: 'WAF-007',
    name: 'File Inclusion - Local',
    pattern: '(?:\\/etc\\/(?:passwd|shadow|hosts)|proc\\/self)',
    target: 'uri',
    action: 'block',
    severity: 'critical',
    enabled: true,
  },
  {
    id: 'WAF-008',
    name: 'File Inclusion - Remote',
    pattern: '(?:(?:https?|ftp|php|data):\\/\\/.*(?:\\.php|\\.asp|\\.jsp))',
    target: 'uri',
    action: 'block',
    severity: 'critical',
    enabled: true,
  },
  {
    id: 'WAF-009',
    name: 'Header Injection',
    pattern: '(?:\\r\\n|\\n)\\s*(?:Set-Cookie|Location|Content-Type)\\s*:',
    target: 'headers',
    action: 'block',
    severity: 'high',
    enabled: true,
  },
  {
    id: 'WAF-010',
    name: 'Null Byte Injection',
    pattern: '(?:%00|\\x00)',
    target: 'uri',
    action: 'block',
    severity: 'medium',
    enabled: true,
  },
];

/**
 * WAFRuleEngine - Web Application Firewall with OWASP Core Rule Set patterns.
 * Evaluates requests against built-in and custom rules for attack detection.
 * Rules are sorted by action severity: block > challenge > log, ensuring
 * higher-severity actions always take precedence.
 */
export class WAFRuleEngine {
  private rules: WAFRule[];
  private blockedRequests: Array<{ timestamp: number; ruleId: string; ip: string }> = [];

  /** Action severity priority: higher number = higher priority */
  private static readonly ACTION_PRIORITY: Record<string, number> = {
    block: 3,
    challenge: 2,
    log: 1,
  };

  constructor(customRules: WAFRule[] = []) {
    this.rules = [...BUILTIN_RULES, ...customRules];
    this.sortRulesByPriority();
  }

  /** Evaluate a request against WAF rules */
  evaluateRequest(request: WAFRequest): WAFDecision {
    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      const content = this.getTargetContent(request, rule.target);
      if (!content) continue;

      try {
        const regex = new RegExp(rule.pattern, 'i');
        if (regex.test(content)) {
          const decision: WAFDecision = {
            action: rule.action === 'log' ? 'allow' : rule.action,
            ruleId: rule.id,
            reason: rule.name,
            timestamp: Date.now(),
          };

          if (decision.action === 'block') {
            this.blockedRequests.push({
              timestamp: Date.now(),
              ruleId: rule.id,
              ip: request.ip,
            });
          }

          return decision;
        }
      } catch {
        // Skip invalid regex patterns
        continue;
      }
    }

    return {
      action: 'allow',
      timestamp: Date.now(),
    };
  }

  /** Add a custom rule (re-sorts rules by priority) */
  addCustomRule(rule: WAFRule): void {
    this.rules.push(rule);
    this.sortRulesByPriority();
  }

  /** Remove a rule by ID */
  removeRule(ruleId: string): void {
    this.rules = this.rules.filter((r) => r.id !== ruleId);
  }

  /** Enable or disable a rule */
  toggleRule(ruleId: string, enabled: boolean): void {
    const rule = this.rules.find((r) => r.id === ruleId);
    if (rule) rule.enabled = enabled;
  }

  /** Get blocked request statistics for a time range */
  getBlockedRequests(timeRange: { start: number; end: number }): BlockedRequestStats {
    const filtered = this.blockedRequests.filter(
      (r) => r.timestamp >= timeRange.start && r.timestamp <= timeRange.end,
    );

    const byRule: Record<string, number> = {};
    const byIP: Record<string, number> = {};

    for (const req of filtered) {
      byRule[req.ruleId] = (byRule[req.ruleId] || 0) + 1;
      byIP[req.ip] = (byIP[req.ip] || 0) + 1;
    }

    return {
      total: filtered.length,
      byRule,
      byIP,
      timeRange,
    };
  }

  /** Get all rules */
  getRules(): WAFRule[] {
    return [...this.rules];
  }

  private getTargetContent(request: WAFRequest, target: WAFRule['target']): string | null {
    switch (target) {
      case 'uri':
        return request.uri;
      case 'body':
        return request.body || null;
      case 'headers':
        return Object.entries(request.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n');
      case 'query':
        return request.query
          ? Object.entries(request.query)
              .map(([k, v]) => `${k}=${v}`)
              .join('&')
          : null;
      case 'cookies':
        return request.cookies
          ? Object.entries(request.cookies)
              .map(([k, v]) => `${k}=${v}`)
              .join('; ')
          : null;
      default:
        return null;
    }
  }

  /** Sort rules so higher-severity actions (block > challenge > log) are evaluated first */
  private sortRulesByPriority(): void {
    this.rules.sort((a, b) => {
      const priorityA = WAFRuleEngine.ACTION_PRIORITY[a.action] ?? 0;
      const priorityB = WAFRuleEngine.ACTION_PRIORITY[b.action] ?? 0;
      return priorityB - priorityA;
    });
  }
}
