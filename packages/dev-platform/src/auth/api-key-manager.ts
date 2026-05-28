import type { APIKey, DeveloperTier, KeyRotation, RateLimit } from '../types.js';

const LIMITS: Record<DeveloperTier, RateLimit> = {
  free: { requestsPerMinute: 10, requestsPerDay: 1000 },
  pro: { requestsPerMinute: 100, requestsPerDay: 50000 },
  enterprise: { requestsPerMinute: 1000, requestsPerDay: 500000 },
};

export class APIKeyManager {
  private keys = new Map<string, APIKey>();
  private rotations = new Map<string, KeyRotation>();

  create(name: string, tier: DeveloperTier, opts?: { scopes?: string[]; ttlMs?: number }): APIKey {
    const now = Date.now();
    const k: APIKey = {
      id: crypto.randomUUID(),
      name,
      createdAt: now,
      revokedAt: null,
      usageCount: 0,
      rateLimit: LIMITS[tier],
      scopes: opts?.scopes ?? ['*'],
      expiresAt: opts?.ttlMs ? now + opts.ttlMs : null,
    };
    this.keys.set(k.id, k);
    return k;
  }

  revoke(id: string): boolean {
    const k = this.keys.get(id);
    if (!k) return false;
    k.revokedAt = Date.now();
    return true;
  }

  getUsage(id: string): number | null {
    return this.keys.get(id)?.usageCount ?? null;
  }

  trackUsage(id: string, endpoint?: string): boolean {
    const k = this.keys.get(id);
    if (!k || k.revokedAt) return false;
    if (k.expiresAt && Date.now() > k.expiresAt) {
      k.revokedAt = Date.now();
      return false;
    }
    if (k.usageCount >= k.rateLimit.requestsPerMinute) return false;
    if (endpoint && !this.hasScope(k, endpoint)) return false;
    k.usageCount++;
    return true;
  }

  isRateLimited(id: string): boolean {
    const k = this.keys.get(id);
    return k ? k.usageCount >= k.rateLimit.requestsPerMinute : false;
  }

  hasScope(key: APIKey, endpoint: string): boolean {
    if (key.scopes.includes('*')) return true;
    return key.scopes.some((s) => endpoint.startsWith(s));
  }

  isExpired(id: string): boolean {
    const k = this.keys.get(id);
    if (!k || !k.expiresAt) return false;
    return Date.now() > k.expiresAt;
  }

  rotate(id: string, tier: DeveloperTier, gracePeriodMs: number): KeyRotation | null {
    const old = this.keys.get(id);
    if (!old || old.revokedAt) return null;
    const newKey = this.create(old.name, tier, { scopes: old.scopes });
    const now = Date.now();
    const rotation: KeyRotation = {
      oldKeyId: id,
      newKeyId: newKey.id,
      rotatedAt: now,
      gracePeriodMs,
      graceEndsAt: now + gracePeriodMs,
    };
    this.rotations.set(id, rotation);
    return rotation;
  }

  finalizeRotation(oldKeyId: string): boolean {
    const rotation = this.rotations.get(oldKeyId);
    if (!rotation) return false;
    this.revoke(oldKeyId);
    this.rotations.delete(oldKeyId);
    return true;
  }

  getRotation(oldKeyId: string): KeyRotation | null {
    return this.rotations.get(oldKeyId) ?? null;
  }

  getKey(id: string): APIKey | null {
    return this.keys.get(id) ?? null;
  }
}
