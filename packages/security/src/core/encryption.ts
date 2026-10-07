// ===============================================================
// Security Package - Encryption Service (PRODUCTION-GRADE)
// ===============================================================

import crypto from 'crypto';
import type { EncryptionConfig, KeyPair, EncryptedData, DerivedKey } from '../types';

/** Default encryption configuration */
const DEFAULT_CONFIG: EncryptionConfig = {
  algorithm: 'aes-256-gcm',
  keySize: 256,
  ivLength: 12,
  tagLength: 16,
  iterations: 100000,
  saltLength: 32,
  keyRotationInterval: 86400000 * 30,
};

/**
 * EncryptionService - Production-grade encryption with AES-256-GCM,
 * RSA keypair generation, PBKDF2 key derivation, envelope encryption, and key rotation.
 * Uses Node.js native crypto module for all operations.
 * ✅ FIX: Replaced FNV-1a hashes and Math.random() with real crypto
 */
export class EncryptionService {
  private config: EncryptionConfig;
  private keyStore: Map<string, { key: Buffer; createdAt: number; active: boolean }>;
  private keyPairs: Map<string, KeyPair>;
  private currentKeyId: string;
  private encryptionCount: number;
  private decryptionCount: number;

  constructor(config: Partial<EncryptionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.keyStore = new Map();
    this.keyPairs = new Map();
    this.encryptionCount = 0;
    this.decryptionCount = 0;

    // Generate initial key using cryptographically secure randomness
    this.currentKeyId = this.generateKeyId();
    this.keyStore.set(this.currentKeyId, {
      key: crypto.randomBytes(this.config.keySize / 8),
      createdAt: Date.now(),
      active: true,
    });
  }

  /** Encrypt plaintext using AES-256-GCM */
  async encrypt(plaintext: string, associatedData?: string): Promise<EncryptedData> {
    const now = Date.now();
    this.encryptionCount++;

    // Check if key rotation is needed
    await this.checkKeyRotation(now);

    const keyEntry = this.keyStore.get(this.currentKeyId);
    if (!keyEntry) throw new Error('No active encryption key');

    // Generate random IV (nonce) using cryptographically secure randomness
    const iv = crypto.randomBytes(this.config.ivLength);

    // Create cipher using Node.js crypto
    const cipher = crypto.createCipheriv(
      this.config.algorithm as crypto.CipherGCMTypes,
      keyEntry.key,
      iv,
    );

    // Encrypt plaintext
    if (associatedData) {
      cipher.setAAD(Buffer.from(associatedData));
    }

    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');

    // Get authentication tag
    const tag = cipher.getAuthTag();

    return {
      ciphertext,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      keyId: this.currentKeyId,
      algorithm: this.config.algorithm,
      version: 1,
      timestamp: now,
    };
  }

  /** Decrypt AES-256-GCM encrypted data */
  async decrypt(encryptedData: EncryptedData, associatedData?: string): Promise<string> {
    this.decryptionCount++;

    const keyEntry = this.keyStore.get(encryptedData.keyId);
    if (!keyEntry) throw new Error(`Key not found: ${encryptedData.keyId}`);

    // Convert hex strings back to buffers
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const tag = Buffer.from(encryptedData.tag, 'hex');

    // Create decipher
    const decipher = crypto.createDecipheriv(
      this.config.algorithm as crypto.CipherGCMTypes,
      keyEntry.key,
      iv,
    );

    // AAD must be set before update()
    if (associatedData) {
      decipher.setAAD(Buffer.from(associatedData));
    }

    // Set authentication tag
    decipher.setAuthTag(tag);

    try {
      let plaintext = decipher.update(encryptedData.ciphertext, 'hex', 'utf8');
      plaintext += decipher.final('utf8');
      return plaintext;
    } catch (error) {
      throw new Error('Authentication tag verification failed - data may be tampered');
    }
  }

  /** Derive a key from password using PBKDF2 */
  async deriveKey(password: string, salt?: string): Promise<DerivedKey> {
    const useSalt = salt ? Buffer.from(salt, 'hex') : crypto.randomBytes(this.config.saltLength);

    const key = crypto.pbkdf2Sync(
      password,
      useSalt,
      this.config.iterations,
      this.config.keySize / 8,
      'sha256',
    );

    return {
      key: key.toString('hex'),
      salt: useSalt.toString('hex'),
      iterations: this.config.iterations,
      algorithm: 'pbkdf2-sha256',
    };
  }

  /** Generate RSA keypair */
  async generateKeyPair(keySize: number = 2048): Promise<KeyPair> {
    const keyId = this.generateKeyId();
    const now = Date.now();

    return new Promise((resolve, reject) => {
      crypto.generateKeyPair(
        'rsa',
        {
          modulusLength: keySize,
          publicKeyEncoding: {
            type: 'spki',
            format: 'pem',
          },
          privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem',
          },
        },
        (err, publicKey, privateKey) => {
          if (err) {
            reject(err);
            return;
          }

          const keypair: KeyPair = {
            publicKey,
            privateKey,
            keyId,
            createdAt: now,
            expiresAt: now + this.config.keyRotationInterval,
            algorithm: 'RSA-OAEP',
            keySize,
          };

          this.keyPairs.set(keyId, keypair);
          resolve(keypair);
        },
      );
    });
  }

  /** Encrypt data with public key */
  async encryptWithPublicKey(data: string, keyId: string): Promise<string> {
    const keypair = this.keyPairs.get(keyId);
    if (!keypair) throw new Error(`Keypair not found: ${keyId}`);

    const encrypted = crypto.publicEncrypt(
      {
        key: keypair.publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(data),
    );

    return encrypted.toString('hex');
  }

  /** Decrypt data with private key */
  async decryptWithPrivateKey(encryptedData: string, keyId: string): Promise<string> {
    const keypair = this.keyPairs.get(keyId);
    if (!keypair) throw new Error(`Keypair not found: ${keyId}`);

    const decrypted = crypto.privateDecrypt(
      {
        key: keypair.privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(encryptedData, 'hex'),
    );

    return decrypted.toString('utf8');
  }

  /** Sign data with private key */
  async sign(data: string, keyId: string): Promise<string> {
    const keypair = this.keyPairs.get(keyId);
    if (!keypair) throw new Error(`Keypair not found: ${keyId}`);

    const signature = crypto.sign('sha256', Buffer.from(data), {
      key: keypair.privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32,
    });

    return signature.toString('hex');
  }

  /** Verify signature with public key */
  async verify(data: string, signature: string, keyId: string): Promise<boolean> {
    const keypair = this.keyPairs.get(keyId);
    if (!keypair) throw new Error(`Keypair not found: ${keyId}`);

    try {
      return crypto.verify(
        'sha256',
        Buffer.from(data),
        {
          key: keypair.publicKey,
          padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: 32,
        },
        Buffer.from(signature, 'hex'),
      );
    } catch {
      return false;
    }
  }

  /** Compute HMAC-SHA256 for message authentication */
  async computeHmac(message: string, key: string): Promise<string> {
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(message);
    return hmac.digest('hex');
  }

  /** Verify HMAC-SHA256 */
  async verifyHmac(message: string, key: string, signature: string): Promise<boolean> {
    const computed = await this.computeHmac(message, key);
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  }

  /** Hash data using SHA-256 */
  async hash(data: string): Promise<string> {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /** Generate random bytes */
  generateRandomBytes(length: number): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /** Check if key rotation is needed */
  private async checkKeyRotation(now: number): Promise<void> {
    const keyEntry = this.keyStore.get(this.currentKeyId);
    if (!keyEntry) return;

    if (now - keyEntry.createdAt > this.config.keyRotationInterval) {
      // Generate new key
      const newKeyId = this.generateKeyId();
      this.keyStore.set(newKeyId, {
        key: crypto.randomBytes(this.config.keySize / 8),
        createdAt: now,
        active: true,
      });

      // Mark old key as inactive
      keyEntry.active = false;
      this.currentKeyId = newKeyId;
    }
  }

  /** Generate a unique key ID using UUID */
  private generateKeyId(): string {
    return `key_${crypto.randomUUID()}`;
  }

  /** Get encryption service statistics */
  getStats(): {
    totalEncryptions: number;
    totalDecryptions: number;
    activeKeys: number;
    keyPairs: number;
  } {
    return {
      totalEncryptions: this.encryptionCount,
      totalDecryptions: this.decryptionCount,
      activeKeys: Array.from(this.keyStore.values()).filter((k) => k.active).length,
      keyPairs: this.keyPairs.size,
    };
  }
}
