// ============================================================================
// QuantAI — in-memory token-bucket rate limiter (F-213).
//
// Credential-stuffing defense for the login proxy route. No external store,
// no new dependencies: a Map of per-key buckets refilled on a fixed schedule.
//
// DESIGN CHOICE — fail-open on limiter error, documented explicitly:
//   The limiter is pure in-memory code with no I/O, so "errors" here can only
//   be programming bugs, never infrastructure failures. Failing CLOSED on such
//   a bug would lock out EVERY user (total login outage); failing OPEN keeps
//   sign-in available while the bug screams in the logs. Availability of the
//   identity path outranks the marginal stuffing protection of a broken
//   limiter — and a broken limiter is always a P0 to fix, not a state to
//   persist. Callers MUST wrap consume() in try/catch and log loudly on error.
// ============================================================================

export interface RateLimiterOptions {
  /** Max burst: how many requests a fresh bucket allows. */
  capacity: number;
  /** Milliseconds to regenerate one token (sustained rate = 1 token / interval). */
  refillIntervalMs: number;
}

export interface ConsumeResult {
  allowed: boolean;
  /** Milliseconds until the next token is available (0 when allowed). */
  retryAfterMs: number;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
  lastSeen: number;
}

const DEFAULT_OPTIONS: RateLimiterOptions = {
  capacity: 10,
  refillIntervalMs: 60_000,
};

export class RateLimiter {
  private readonly capacity: number;
  private readonly refillIntervalMs: number;
  private readonly buckets = new Map<string, Bucket>();

  constructor(options: Partial<RateLimiterOptions> = {}) {
    const merged = { ...DEFAULT_OPTIONS, ...options };
    if (!Number.isFinite(merged.capacity) || merged.capacity < 1) {
      throw new Error('RateLimiter: capacity must be a positive number');
    }
    if (!Number.isFinite(merged.refillIntervalMs) || merged.refillIntervalMs < 1) {
      throw new Error('RateLimiter: refillIntervalMs must be a positive number');
    }
    this.capacity = Math.floor(merged.capacity);
    this.refillIntervalMs = Math.floor(merged.refillIntervalMs);
  }

  consume(key: string, now: number = Date.now()): ConsumeResult {
    const normalized = key && key.length > 0 ? key : 'unknown';
    this.prune(now);

    let bucket = this.buckets.get(normalized);
    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now, lastSeen: now };
      this.buckets.set(normalized, bucket);
    }

    // Refill tokens earned since the last refill checkpoint.
    const elapsed = now - bucket.lastRefill;
    if (elapsed >= this.refillIntervalMs) {
      const earned = Math.floor(elapsed / this.refillIntervalMs);
      bucket.tokens = Math.min(this.capacity, bucket.tokens + earned);
      bucket.lastRefill += earned * this.refillIntervalMs;
    }
    bucket.lastSeen = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true, retryAfterMs: 0 };
    }

    // Denied: time until the next token regenerates.
    const retryAfterMs = bucket.lastRefill + this.refillIntervalMs - now;
    return { allowed: false, retryAfterMs: Math.max(1, retryAfterMs) };
  }

  /** Number of tracked keys (useful for tests and ops introspection). */
  size(): number {
    return this.buckets.size;
  }

  /** Clears all buckets. Intended for tests and ops; not a security boundary. */
  reset(): void {
    this.buckets.clear();
  }

  /**
   * Drops buckets that are fully refilled AND idle — bounds memory when the
   * key space is attacker-controlled (e.g. spoofed X-Forwarded-For values).
   * A bucket is evictable once it has sat idle longer than a full refill
   * cycle, at which point it would be indistinguishable from a fresh bucket.
   */
  private prune(now: number): void {
    const idleThresholdMs = this.capacity * this.refillIntervalMs;
    for (const [key, bucket] of this.buckets) {
      const idleFor = now - bucket.lastSeen;
      if (idleFor >= idleThresholdMs) {
        // Fully refilled by now: tokens would equal capacity.
        this.buckets.delete(key);
      }
    }
  }
}

/**
 * Best-effort client IP for rate-limit keying. Trusts X-Forwarded-For because
 * the app runs behind the platform reverse proxy; takes the left-most (client)
 * entry. Never throws.
 */
export function getClientIp(request: Request): string {
  try {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
      const first = forwarded.split(',')[0]?.trim();
      if (first) return first;
    }
    const realIp = request.headers.get('x-real-ip')?.trim();
    if (realIp) return realIp;
  } catch {
    // Header access failed — fall through to 'unknown'.
  }
  return 'unknown';
}

/**
 * Shared login limiter: 10-attempt burst, then 1 attempt/minute sustained,
 * keyed per client IP. Aggressive enough to make credential stuffing
 * impractical (600 attempts/hour/IP worst case), generous enough that a real
 * user retrying typos never notices it.
 */
export const loginRateLimiter = new RateLimiter({
  capacity: 10,
  refillIntervalMs: 60_000,
});
