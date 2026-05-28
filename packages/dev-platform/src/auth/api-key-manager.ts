import { APIKey, DeveloperTier, RateLimit } from '../types.js';
// prettier-ignore
const LIMITS: Record<DeveloperTier, RateLimit> = { free: { requestsPerMinute: 10, requestsPerDay: 1000 }, pro: { requestsPerMinute: 100, requestsPerDay: 50000 }, enterprise: { requestsPerMinute: 1000, requestsPerDay: 500000 } };
export class APIKeyManager {
  private keys = new Map<string, APIKey>();
  create(name: string, tier: DeveloperTier): APIKey {
    // prettier-ignore
    const k: APIKey = { id: crypto.randomUUID(), name, createdAt: Date.now(), revokedAt: null, usageCount: 0, rateLimit: LIMITS[tier] };
    this.keys.set(k.id, k);
    return k;
  }
  // prettier-ignore
  revoke(id: string) { const k = this.keys.get(id); if (!k) return false; k.revokedAt = Date.now(); return true; }
  // prettier-ignore
  getUsage(id: string) { return this.keys.get(id)?.usageCount ?? null; }
  trackUsage(id: string) {
    const k = this.keys.get(id);
    if (!k || k.revokedAt || k.usageCount >= k.rateLimit.requestsPerMinute) return false;
    k.usageCount++;
    return true;
  }
  // prettier-ignore
  isRateLimited(id: string) { const k = this.keys.get(id); return k ? k.usageCount >= k.rateLimit.requestsPerMinute : false; }
}
