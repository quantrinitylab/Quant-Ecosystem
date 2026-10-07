// ============================================================================
// Security Package - Configurable Rate Limiter
// ============================================================================

import { z } from 'zod';

export const RateLimitRuleSchema = z.object({
  action: z.string(),
  maxRequests: z.number().positive(),
  windowMs: z.number().positive(),
  perUser: z.boolean(),
  perIp: z.boolean(),
});

export type RateLimitRule = z.infer<typeof RateLimitRuleSchema>;

export const RateLimitCheckResultSchema = z.object({
  allowed: z.boolean(),
  remaining: z.number().min(0),
  resetAt: z.number(),
  retryAfterMs: z.number().nullable(),
});

export type RateLimitCheckResult = z.infer<typeof RateLimitCheckResultSchema>;

/** Storage interface for rate limit data - allows Redis or in-memory implementation */
export interface RateLimitStore {
  get(key: string): Promise<number | null>;
  increment(key: string, windowMs: number): Promise<number>;
  reset(key: string): Promise<void>;
  getTTL(key: string): Promise<number | null>;
}

/** In-memory rate limit store entry */
interface StoreEntry {
  count: number;
  expiresAt: number;
}

/**
 * InMemoryRateLimitStore - Simple in-memory implementation of RateLimitStore.
 * Suitable for single-instance deployments or testing.
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private store: Map<string, StoreEntry>;

  constructor() {
    this.store = new Map();
  }

  async get(key: string): Promise<number | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.count;
  }

  async increment(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now > entry.expiresAt) {
      this.store.set(key, { count: 1, expiresAt: now + windowMs });
      return 1;
    }

    entry.count++;
    return entry.count;
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  async getTTL(key: string): Promise<number | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    const now = Date.now();
    if (now > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.expiresAt - now;
  }
}

/**
 * ConfigurableRateLimiter - Higher-level rate limiter with per-action,
 * per-user, per-IP configurable rules. Works with any RateLimitStore implementation.
 */
export class ConfigurableRateLimiter {
  private store: RateLimitStore;
  private rules: Map<string, RateLimitRule>;

  constructor(store: RateLimitStore, defaultRules: RateLimitRule[] = []) {
    this.store = store;
    this.rules = new Map();
    for (const rule of defaultRules) {
      this.rules.set(rule.action, RateLimitRuleSchema.parse(rule));
    }
  }

  /** Configure a rate limit rule for an action */
  configure(action: string, rule: RateLimitRule): void {
    this.rules.set(action, RateLimitRuleSchema.parse(rule));
  }

  /** Check if a request is within rate limits */
  async checkLimit(params: {
    userId?: string;
    ip?: string;
    action: string;
  }): Promise<RateLimitCheckResult> {
    const rule = this.rules.get(params.action);
    if (!rule) {
      // No rule configured, allow by default
      return {
        allowed: true,
        remaining: Number.MAX_SAFE_INTEGER,
        resetAt: 0,
        retryAfterMs: null,
      };
    }

    const key = this.buildKey(params, rule);
    const count = await this.store.increment(key, rule.windowMs);
    const ttl = await this.store.getTTL(key);
    const retryAfterMs = ttl ?? rule.windowMs;
    const resetAt = Date.now() + retryAfterMs;

    if (count > rule.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfterMs,
      };
    }

    return {
      allowed: true,
      remaining: rule.maxRequests - count,
      resetAt,
      retryAfterMs: null,
    };
  }

  /** Reset rate limits for specific parameters */
  async resetLimits(params: { userId?: string; ip?: string; action?: string }): Promise<void> {
    if (params.action) {
      const rule = this.rules.get(params.action);
      if (rule) {
        const key = this.buildKey(
          { userId: params.userId, ip: params.ip, action: params.action },
          rule,
        );
        await this.store.reset(key);
      }
    } else {
      // Reset all rules for this user/ip
      for (const [action, rule] of this.rules) {
        const key = this.buildKey({ userId: params.userId, ip: params.ip, action }, rule);
        await this.store.reset(key);
      }
    }
  }

  private buildKey(
    params: { userId?: string; ip?: string; action: string },
    rule: RateLimitRule,
  ): string {
    const parts: string[] = ['rl', params.action];
    if (rule.perUser && params.userId) {
      parts.push(`u:${params.userId}`);
    }
    if (rule.perIp && params.ip) {
      parts.push(`ip:${params.ip}`);
    }
    return parts.join(':');
  }
}
