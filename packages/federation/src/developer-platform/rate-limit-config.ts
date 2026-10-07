import { z } from 'zod';

export const RateLimitRuleSchema = z.object({
  scope: z.string(),
  maxRequests: z.number().positive(),
  windowMs: z.number().positive(),
  burstLimit: z.number().positive().optional(),
});

export type RateLimitRule = z.infer<typeof RateLimitRuleSchema>;

export const RateLimitConfigSchema = z.object({
  defaultRule: RateLimitRuleSchema,
  scopeRules: z.array(RateLimitRuleSchema),
});

export type RateLimitConfigType = z.infer<typeof RateLimitConfigSchema>;

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

export class RateLimitConfig {
  private rules: Map<string, RateLimitRule> = new Map();
  private defaultRule: RateLimitRule;
  private entries: Map<string, RateLimitEntry> = new Map();

  constructor(config?: RateLimitConfigType) {
    this.defaultRule = config?.defaultRule ?? {
      scope: 'default',
      maxRequests: 1000,
      windowMs: 60_000,
    };

    if (config?.scopeRules) {
      for (const rule of config.scopeRules) {
        this.rules.set(rule.scope, rule);
      }
    }
  }

  addRule(rule: RateLimitRule): void {
    const parsed = RateLimitRuleSchema.parse(rule);
    this.rules.set(parsed.scope, parsed);
  }

  removeRule(scope: string): void {
    this.rules.delete(scope);
  }

  check(clientId: string, scope: string): RateLimitResult {
    const rule = this.rules.get(scope) ?? this.defaultRule;
    const key = `${clientId}:${scope}`;
    const now = Date.now();

    let entry = this.entries.get(key);

    if (!entry || now - entry.windowStart >= rule.windowMs) {
      entry = { count: 0, windowStart: now };
      this.entries.set(key, entry);
    }

    entry.count++;
    const allowed = entry.count <= rule.maxRequests;
    const remaining = Math.max(0, rule.maxRequests - entry.count);
    const resetAt = entry.windowStart + rule.windowMs;

    return { allowed, remaining, resetAt, limit: rule.maxRequests };
  }

  reset(clientId: string, scope: string): void {
    this.entries.delete(`${clientId}:${scope}`);
  }

  getRules(): RateLimitRule[] {
    return [...this.rules.values()];
  }

  getDefaultRule(): RateLimitRule {
    return { ...this.defaultRule };
  }
}
