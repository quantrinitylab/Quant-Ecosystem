import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  type CipherGCM,
  type DecipherGCM,
} from 'node:crypto';
import { z } from 'zod';
import type { EncryptedKeyEntry, KeyVaultConfig } from './types.js';

export const StoreKeySchema = z.object({
  userId: z.string().min(1),
  provider: z.string().min(1),
  apiKey: z.string().min(1),
});

/**
 * TEST-ONLY default salt. In production, `masterSecret` MUST be provided via
 * environment variable or secret manager. Using this default means all vault
 * instances share the same encryption key, which is unsuitable for any
 * deployment handling real user credentials.
 */
const TEST_ONLY_DEFAULT_SALT = 'quant-vault-default-salt';

const DEFAULT_CONFIG: KeyVaultConfig = {
  encryptionAlgorithm: 'aes-256-gcm',
  keyDerivationSalt: TEST_ONLY_DEFAULT_SALT,
};

/**
 * Encrypted key vault using AES-256-GCM with scrypt-derived master key.
 *
 * SECURITY NOTE: The `masterSecret` parameter controls the encryption master key.
 * In production, this MUST come from an environment variable or secret manager
 * (e.g., `process.env.VAULT_MASTER_SECRET`). The default value is only suitable
 * for tests and local development. Sharing the same master secret across all
 * users means compromise of the secret exposes all stored credentials.
 */
export class EncryptedKeyVault {
  private readonly config: KeyVaultConfig;
  private readonly entries: Map<string, EncryptedKeyEntry[]> = new Map();
  private readonly masterKey: Buffer;

  /**
   * @param masterSecret - Secret used to derive the AES-256 encryption key.
   *   In production, pass a value from `process.env` or a secrets manager.
   *   The default is TEST-ONLY and must not be used in deployed environments.
   * @param config - Optional additional vault configuration.
   */
  constructor(masterSecret: string = TEST_ONLY_DEFAULT_SALT, config: Partial<KeyVaultConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.masterKey = scryptSync(masterSecret, 'quant-salt', 32);
  }

  storeKey(userId: string, provider: string, apiKey: string): EncryptedKeyEntry {
    StoreKeySchema.parse({ userId, provider, apiKey });

    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv) as CipherGCM;

    let encrypted = cipher.update(apiKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    const encryptedKey = encrypted + ':' + authTag;

    const entry: EncryptedKeyEntry = {
      id: `key_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      userId,
      provider,
      encryptedKey,
      iv: iv.toString('hex'),
      algorithm: this.config.encryptionAlgorithm,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    };

    const userEntries = this.entries.get(userId) ?? [];
    const existingIndex = userEntries.findIndex((e) => e.provider === provider);
    if (existingIndex >= 0) {
      userEntries[existingIndex] = entry;
    } else {
      userEntries.push(entry);
    }
    this.entries.set(userId, userEntries);

    return entry;
  }

  retrieveKey(userId: string, provider: string): string {
    const userEntries = this.entries.get(userId);
    if (!userEntries) throw new Error(`No keys found for user: ${userId}`);

    const entry = userEntries.find((e) => e.provider === provider);
    if (!entry) throw new Error(`No key found for provider: ${provider}`);

    const [encrypted, authTag] = entry.encryptedKey.split(':');
    if (!encrypted || !authTag) throw new Error('Invalid encrypted key format');

    const iv = Buffer.from(entry.iv, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', this.masterKey, iv) as DecipherGCM;
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    entry.lastUsedAt = Date.now();

    return decrypted;
  }

  deleteKey(userId: string, provider: string): boolean {
    const userEntries = this.entries.get(userId);
    if (!userEntries) return false;

    const index = userEntries.findIndex((e) => e.provider === provider);
    if (index < 0) return false;

    userEntries.splice(index, 1);
    if (userEntries.length === 0) {
      this.entries.delete(userId);
    }
    return true;
  }

  listKeys(userId: string): Omit<EncryptedKeyEntry, 'encryptedKey'>[] {
    const userEntries = this.entries.get(userId) ?? [];
    return userEntries.map(({ encryptedKey: _enc, ...rest }) => rest);
  }

  rotateKey(userId: string, provider: string, newKey: string): EncryptedKeyEntry {
    this.deleteKey(userId, provider);
    return this.storeKey(userId, provider, newKey);
  }
}
