// ============================================================================
// E2E - Encrypted Backup Service
// Argon2id-derived backup key for encrypting all keys and history
// ============================================================================

import * as crypto from 'node:crypto';
import argon2 from 'argon2';

export interface EncryptedBackup {
  salt: string;
  nonce: string;
  ciphertext: string;
  authTag: string;
  version: number;
}

export class EncryptedBackupService {
  private readonly ARGON2_TIME_COST = 3;
  private readonly ARGON2_MEMORY_COST = 65536;
  private readonly ARGON2_PARALLELISM = 1;
  private readonly KEY_LENGTH = 32;

  /**
   * Create an encrypted backup of data using a passphrase
   */
  async createBackup(passphrase: string, data: Buffer): Promise<EncryptedBackup> {
    const salt = crypto.randomBytes(16);

    // Derive key using Argon2id
    const key = await argon2.hash(passphrase, {
      type: argon2.argon2id,
      salt,
      timeCost: this.ARGON2_TIME_COST,
      memoryCost: this.ARGON2_MEMORY_COST,
      parallelism: this.ARGON2_PARALLELISM,
      hashLength: this.KEY_LENGTH,
      raw: true,
    });

    // Encrypt data with AES-256-GCM
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
    const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      salt: salt.toString('base64'),
      nonce: nonce.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      authTag: authTag.toString('base64'),
      version: 1,
    };
  }

  /**
   * Restore data from an encrypted backup using the passphrase
   */
  async restoreBackup(passphrase: string, encryptedBackup: EncryptedBackup): Promise<Buffer> {
    const salt = Buffer.from(encryptedBackup.salt, 'base64');
    const nonce = Buffer.from(encryptedBackup.nonce, 'base64');
    const ciphertext = Buffer.from(encryptedBackup.ciphertext, 'base64');
    const authTag = Buffer.from(encryptedBackup.authTag, 'base64');

    // Derive the same key using Argon2id
    const key = await argon2.hash(passphrase, {
      type: argon2.argon2id,
      salt,
      timeCost: this.ARGON2_TIME_COST,
      memoryCost: this.ARGON2_MEMORY_COST,
      parallelism: this.ARGON2_PARALLELISM,
      hashLength: this.KEY_LENGTH,
      raw: true,
    });

    // Decrypt data
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return plaintext;
  }
}
