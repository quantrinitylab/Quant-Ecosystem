import { z } from 'zod';
import { randomBytes } from 'node:crypto';

export const APIKeySchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  ownerId: z.string(),
  scopes: z.array(z.string()),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  lastUsedAt: z.string().datetime().optional(),
  revoked: z.boolean(),
});

export type APIKey = z.infer<typeof APIKeySchema>;

export interface CreateKeyOptions {
  name: string;
  ownerId: string;
  scopes: string[];
  expiresAt?: string;
}

export interface ValidateResult {
  valid: boolean;
  key?: Omit<APIKey, 'key'>;
  reason?: string;
}

export class APIKeyManager {
  private keys: Map<string, APIKey> = new Map();

  create(options: CreateKeyOptions): APIKey {
    const id = randomBytes(8).toString('hex');
    const key = `qk_${randomBytes(32).toString('hex')}`;

    const apiKey: APIKey = {
      id,
      key,
      name: options.name,
      ownerId: options.ownerId,
      scopes: options.scopes,
      createdAt: new Date().toISOString(),
      expiresAt: options.expiresAt,
      revoked: false,
    };

    this.keys.set(id, apiKey);
    return apiKey;
  }

  validate(keyValue: string): ValidateResult {
    const apiKey = [...this.keys.values()].find((k) => k.key === keyValue);

    if (!apiKey) {
      return { valid: false, reason: 'Key not found' };
    }

    if (apiKey.revoked) {
      return { valid: false, reason: 'Key has been revoked' };
    }

    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      return { valid: false, reason: 'Key has expired' };
    }

    apiKey.lastUsedAt = new Date().toISOString();

    // Return redacted view without the raw key to prevent accidental logging
    const { key: _secret, ...redacted } = apiKey;
    return { valid: true, key: redacted };
  }

  hasScope(keyValue: string, scope: string): boolean {
    const result = this.validate(keyValue);
    if (!result.valid || !result.key) return false;
    return result.key.scopes.includes(scope) || result.key.scopes.includes('*');
  }

  rotate(keyId: string): APIKey | null {
    const existing = this.keys.get(keyId);
    if (!existing || existing.revoked) {
      return null;
    }

    existing.revoked = true;

    const newKey = this.create({
      name: existing.name,
      ownerId: existing.ownerId,
      scopes: existing.scopes,
      expiresAt: existing.expiresAt,
    });

    return newKey;
  }

  revoke(keyId: string): boolean {
    const key = this.keys.get(keyId);
    if (!key) return false;

    key.revoked = true;
    return true;
  }

  listByOwner(ownerId: string): APIKey[] {
    return [...this.keys.values()].filter((k) => k.ownerId === ownerId);
  }

  getKey(keyId: string): APIKey | null {
    return this.keys.get(keyId) ?? null;
  }
}
