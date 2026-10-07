// ============================================================================
// Security Package - Secret Manager
// ============================================================================

import type { SecretVaultAdapter, SecretAccessLog } from '../types';

/** Common patterns that indicate secrets in environment variables */
const SECRET_PATTERNS = [
  /(?:password|passwd|pwd)\s*[=:]\s*\S+/i,
  /(?:api[_-]?key|apikey)\s*[=:]\s*\S+/i,
  /(?:secret|token)\s*[=:]\s*\S+/i,
  /(?:private[_-]?key)\s*[=:]\s*\S+/i,
  /(?:aws[_-]?access[_-]?key[_-]?id)\s*[=:]\s*[A-Z0-9]{20}/i,
  /(?:aws[_-]?secret[_-]?access[_-]?key)\s*[=:]\s*\S{40}/i,
  /ghp_[a-zA-Z0-9]{36}/,
  /glpat-[a-zA-Z0-9\-_]{20}/,
  /(?:bearer\s+)[a-zA-Z0-9\-._~+/]+=*/i,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
];

/** In-memory vault adapter for testing/development */
export class InMemoryVaultAdapter implements SecretVaultAdapter {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(): Promise<string[]> {
    return Array.from(this.store.keys());
  }
}

/**
 * SecretManager - Secure secret handling with vault backends.
 * Supports AWS Secrets Manager and HashiCorp Vault via adapter pattern.
 */
export class SecretManager {
  private adapter: SecretVaultAdapter;
  private accessLog: SecretAccessLog[] = [];
  private actor: string;

  constructor(adapter: SecretVaultAdapter, actor: string = 'system') {
    this.adapter = adapter;
    this.actor = actor;
  }

  /** Retrieve a secret from the vault */
  async getSecret(key: string): Promise<string | null> {
    this.logAccess(key, 'read');
    return this.adapter.get(key);
  }

  /** Rotate a secret to a new value */
  async rotateSecret(key: string, newValue: string): Promise<void> {
    this.logAccess(key, 'rotate');
    await this.adapter.set(key, newValue);
  }

  /** Get the access audit log for a specific key */
  auditAccess(key?: string): SecretAccessLog[] {
    if (key) {
      return this.accessLog.filter((log) => log.key === key);
    }
    return [...this.accessLog];
  }

  /** Scan environment variables for leaked secrets */
  validateNoSecretsInEnv(envVars: Record<string, string>): {
    clean: boolean;
    leaks: { variable: string; pattern: string }[];
  } {
    const leaks: { variable: string; pattern: string }[] = [];

    for (const [variable, value] of Object.entries(envVars)) {
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(value) || pattern.test(`${variable}=${value}`)) {
          leaks.push({ variable, pattern: pattern.source });
          break;
        }
      }
    }

    return { clean: leaks.length === 0, leaks };
  }

  /** Delete a secret from the vault */
  async deleteSecret(key: string): Promise<void> {
    this.logAccess(key, 'delete');
    await this.adapter.delete(key);
  }

  /** List all secret keys in the vault */
  async listSecrets(): Promise<string[]> {
    return this.adapter.list();
  }

  private logAccess(key: string, action: SecretAccessLog['action']): void {
    this.accessLog.push({
      key,
      action,
      actor: this.actor,
      timestamp: Date.now(),
    });
  }
}
