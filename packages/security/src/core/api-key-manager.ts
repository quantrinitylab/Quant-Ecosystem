// ============================================================================
// Security Package - API Key Manager
// ============================================================================

import crypto from 'node:crypto';
import type { APIKey, APIKeyScope, APIKeyValidation } from '../types';

/** Configuration for API key management */
interface APIKeyConfig {
  keyPrefix: string;
  keyLength: number;
  defaultExpiry: number;
  defaultRateLimit: number;
  maxKeysPerUser: number;
}

/** Default configuration */
const DEFAULT_CONFIG: APIKeyConfig = {
  keyPrefix: 'qk',
  keyLength: 32,
  defaultExpiry: 86400000 * 365,
  defaultRateLimit: 1000,
  maxKeysPerUser: 10,
};

/**
 * APIKeyManager - Complete API key lifecycle management with generation,
 * scoping, rotation, revocation, and usage tracking.
 */
export class APIKeyManager {
  private config: APIKeyConfig;
  private keys: Map<string, APIKey>;
  private hashIndex: Map<string, string>;
  private userKeys: Map<string, string[]>;
  private rateLimitCounters: Map<string, { count: number; windowStart: number }>;
  private revokedKeys: Set<string>;

  constructor(config: Partial<APIKeyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.keys = new Map();
    this.hashIndex = new Map();
    this.userKeys = new Map();
    this.rateLimitCounters = new Map();
    this.revokedKeys = new Set();
  }

  /** Generate a new API key */
  async generateKey(
    name: string,
    userId: string,
    scopes: APIKeyScope[],
    options: {
      expiresIn?: number;
      rateLimit?: number;
      metadata?: Record<string, string>;
    } = {},
  ): Promise<APIKey> {
    // Check max keys per user
    const existingKeys = this.userKeys.get(userId) || [];
    if (existingKeys.length >= this.config.maxKeysPerUser) {
      throw new Error(`Maximum keys (${this.config.maxKeysPerUser}) reached for user`);
    }

    const now = Date.now();
    const rawKey = this.generateRawKey();
    const prefix = `${this.config.keyPrefix}_`;
    const fullKey = `${prefix}${rawKey}`;
    const hash = this.hashKey(fullKey);
    const id = this.generateId();

    const apiKey: APIKey = {
      id,
      key: fullKey,
      prefix: fullKey.substring(0, 8),
      hash,
      name,
      scopes,
      createdAt: now,
      expiresAt: now + (options.expiresIn || this.config.defaultExpiry),
      lastUsed: 0,
      usageCount: 0,
      rateLimit: options.rateLimit || this.config.defaultRateLimit,
      active: true,
      metadata: options.metadata || {},
    };

    this.keys.set(id, apiKey);
    this.hashIndex.set(hash, id);

    // Track user keys
    existingKeys.push(id);
    this.userKeys.set(userId, existingKeys);

    return apiKey;
  }

  /** Validate an API key */
  async validateKey(
    key: string,
    requiredScope?: { resource: string; action: string },
  ): Promise<APIKeyValidation> {
    const hash = this.hashKey(key);
    const keyId = this.hashIndex.get(hash);

    if (!keyId) {
      return { valid: false, reason: 'key_not_found' };
    }

    const apiKey = this.keys.get(keyId);
    if (!apiKey) {
      return { valid: false, reason: 'key_not_found' };
    }

    // Check if revoked
    if (this.revokedKeys.has(keyId) || !apiKey.active) {
      return { valid: false, reason: 'key_revoked', key: apiKey };
    }

    // Check expiry
    const now = Date.now();
    if (now > apiKey.expiresAt) {
      return { valid: false, reason: 'key_expired', key: apiKey };
    }

    // Check rate limit
    if (!this.checkRateLimit(keyId, apiKey.rateLimit)) {
      return { valid: false, reason: 'rate_limit_exceeded', key: apiKey, remainingUses: 0 };
    }

    // Check scope
    if (requiredScope) {
      const hasScope = this.checkScope(apiKey.scopes, requiredScope.resource, requiredScope.action);
      if (!hasScope) {
        return { valid: false, reason: 'insufficient_scope', key: apiKey };
      }
    }

    // Update usage
    apiKey.lastUsed = now;
    apiKey.usageCount++;
    this.incrementRateLimit(keyId);

    const counter = this.rateLimitCounters.get(keyId);
    const remainingUses = apiKey.rateLimit - (counter?.count || 0);

    return { valid: true, key: apiKey, remainingUses };
  }

  /** Rotate an API key (generate new, revoke old) */
  async rotateKey(keyId: string): Promise<APIKey | null> {
    const oldKey = this.keys.get(keyId);
    if (!oldKey) return null;

    // Find user for this key
    let userId = '';
    for (const [uid, keys] of this.userKeys) {
      if (keys.includes(keyId)) {
        userId = uid;
        break;
      }
    }

    // Temporarily increase limit to allow new key generation
    const userKeys = this.userKeys.get(userId) || [];
    const tempMax = this.config.maxKeysPerUser;
    this.config.maxKeysPerUser = userKeys.length + 1;

    // Generate new key with same properties
    const newKey = await this.generateKey(oldKey.name, userId, oldKey.scopes, {
      expiresIn: oldKey.expiresAt - Date.now(),
      rateLimit: oldKey.rateLimit,
      metadata: { ...oldKey.metadata, rotatedFrom: keyId },
    });

    this.config.maxKeysPerUser = tempMax;

    // Revoke old key
    await this.revokeKey(keyId);

    return newKey;
  }

  /** Revoke an API key */
  async revokeKey(keyId: string): Promise<boolean> {
    const key = this.keys.get(keyId);
    if (!key) return false;

    key.active = false;
    this.revokedKeys.add(keyId);
    this.hashIndex.delete(key.hash);

    return true;
  }

  /** Get all keys for a user */
  getKeysForUser(userId: string): APIKey[] {
    const keyIds = this.userKeys.get(userId) || [];
    return keyIds
      .map((id) => this.keys.get(id))
      .filter((k): k is APIKey => k !== undefined && k.active);
  }

  /** Get key by ID */
  getKey(keyId: string): APIKey | undefined {
    return this.keys.get(keyId);
  }

  /** Update key scopes */
  async updateScopes(keyId: string, scopes: APIKeyScope[]): Promise<boolean> {
    const key = this.keys.get(keyId);
    if (!key || !key.active) return false;
    key.scopes = scopes;
    return true;
  }

  /** Update key rate limit */
  async updateRateLimit(keyId: string, rateLimit: number): Promise<boolean> {
    const key = this.keys.get(keyId);
    if (!key || !key.active) return false;
    key.rateLimit = rateLimit;
    return true;
  }

  /** Check if key has required scope */
  private checkScope(scopes: APIKeyScope[], resource: string, action: string): boolean {
    for (const scope of scopes) {
      // Wildcard resource
      if (scope.resource === '*') return true;

      // Check resource match (supports glob patterns)
      if (this.matchResource(scope.resource, resource)) {
        // Check action
        if (scope.actions.includes('*') || scope.actions.includes(action)) {
          return true;
        }
      }
    }
    return false;
  }

  /** Match resource with glob-like patterns */
  private matchResource(pattern: string, resource: string): boolean {
    if (pattern === resource) return true;
    if (pattern.endsWith('*')) {
      return resource.startsWith(pattern.slice(0, -1));
    }
    return false;
  }

  /** Check rate limit for a key */
  private checkRateLimit(keyId: string, limit: number): boolean {
    const now = Date.now();
    const counter = this.rateLimitCounters.get(keyId);

    if (!counter || now - counter.windowStart > 3600000) {
      return true; // No counter or window expired
    }

    return counter.count < limit;
  }

  /** Increment rate limit counter */
  private incrementRateLimit(keyId: string): void {
    const now = Date.now();
    const counter = this.rateLimitCounters.get(keyId);

    if (!counter || now - counter.windowStart > 3600000) {
      this.rateLimitCounters.set(keyId, { count: 1, windowStart: now });
    } else {
      counter.count++;
    }
  }

  /** Generate raw key material */
  private generateRawKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.randomBytes(this.config.keyLength);
    let key = '';
    for (let i = 0; i < this.config.keyLength; i++) {
      key += chars[bytes[i]! % chars.length];
    }
    return key;
  }

  /** Hash a key for secure storage (one-way SHA-256). Deterministic: the same
   * key always yields the same digest so hash-index lookups remain stable. */
  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /** Generate unique ID */
  private generateId(): string {
    return `apikey_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  }

  /** Get manager statistics */
  getStats(): { totalKeys: number; activeKeys: number; revokedKeys: number } {
    let active = 0;
    for (const key of this.keys.values()) {
      if (key.active) active++;
    }
    return {
      totalKeys: this.keys.size,
      activeKeys: active,
      revokedKeys: this.revokedKeys.size,
    };
  }

  /** Cleanup expired keys */
  async cleanup(): Promise<number> {
    const now = Date.now();
    let removed = 0;

    for (const [_id, key] of this.keys) {
      if (now > key.expiresAt && key.active) {
        key.active = false;
        this.hashIndex.delete(key.hash);
        removed++;
      }
    }

    return removed;
  }
}
