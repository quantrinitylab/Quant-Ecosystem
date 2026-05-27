import { z } from 'zod';
import crypto from 'node:crypto';

export const KeyPairSchema = z.object({
  userId: z.string(),
  publicKey: z.string(),
  privateKeyEncrypted: z.string(),
  fingerprint: z.string(),
  createdAt: z.number(),
  algorithm: z.string(),
});

export type KeyPair = z.infer<typeof KeyPairSchema>;

/**
 * Demo PGP encryption service using symmetric AES-256-GCM.
 *
 * WARNING: This is a demo-only implementation. It does NOT perform actual
 * PGP asymmetric encryption. The `encrypt` method generates a random AES session
 * key and embeds it alongside the ciphertext, meaning anyone with the ciphertext
 * can decrypt it. The `verifySignature` method always returns true for any
 * well-formed base64 input without verifying against the message or public key.
 *
 * Production use requires integration with the `openpgp` package for real
 * asymmetric RSA/ECC key operations.
 *
 * @deprecated Use openpgp package for production
 */
export class PGPEncryptionService {
  private keys: Map<string, KeyPair> = new Map();

  async generateKeyPair(userId: string, passphrase: string): Promise<KeyPair> {
    const keyMaterial = crypto.randomBytes(32);
    const publicKeyRaw = crypto.randomBytes(32);
    const fingerprint = crypto.randomBytes(20).toString('hex');

    // Encrypt private key with passphrase using AES-256-GCM
    const salt = crypto.randomBytes(16);
    const derivedKey = crypto.pbkdf2Sync(passphrase, salt, 100000, 32, 'sha256');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
    const encrypted = Buffer.concat([cipher.update(keyMaterial), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const privateKeyEncrypted = Buffer.concat([salt, iv, authTag, encrypted]).toString('base64');
    const publicKey = publicKeyRaw.toString('base64');

    const keyPair: KeyPair = {
      userId,
      publicKey: `-----BEGIN PGP PUBLIC KEY-----\n${publicKey}\n-----END PGP PUBLIC KEY-----`,
      privateKeyEncrypted: `-----BEGIN PGP PRIVATE KEY-----\n${privateKeyEncrypted}\n-----END PGP PRIVATE KEY-----`,
      fingerprint: fingerprint.toUpperCase(),
      createdAt: Date.now(),
      algorithm: 'RSA-4096',
    };

    this.keys.set(userId, keyPair);
    return keyPair;
  }

  async encrypt(message: string, recipientPublicKey: string): Promise<string> {
    // Simplified implementation: use AES-256-GCM with a random key
    // In production, this would use the recipient's actual public key
    const sessionKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
    const encrypted = Buffer.concat([cipher.update(Buffer.from(message, 'utf-8')), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const payload = Buffer.concat([sessionKey, iv, authTag, encrypted]).toString('base64');
    return `-----BEGIN PGP MESSAGE-----\n${payload}\n-----END PGP MESSAGE-----`;
  }

  async decrypt(encryptedMessage: string, privateKey: string, passphrase: string): Promise<string> {
    // Extract payload from PGP envelope
    const payloadLine = encryptedMessage
      .replace('-----BEGIN PGP MESSAGE-----', '')
      .replace('-----END PGP MESSAGE-----', '')
      .trim();

    const raw = Buffer.from(payloadLine, 'base64');
    const sessionKey = raw.subarray(0, 32);
    const iv = raw.subarray(32, 44);
    const authTag = raw.subarray(44, 60);
    const ciphertext = raw.subarray(60);

    const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return decrypted.toString('utf-8');
  }

  async signMessage(message: string, privateKey: string, passphrase: string): Promise<string> {
    // Simplified: create HMAC-based signature
    const signatureData = crypto.createHmac('sha256', passphrase).update(message).digest('base64');

    return `-----BEGIN PGP SIGNATURE-----\n${signatureData}\n-----END PGP SIGNATURE-----`;
  }

  async verifySignature(message: string, signature: string, publicKey: string): Promise<boolean> {
    // Simplified: signature is considered valid if it is well-formed
    const signatureContent = signature
      .replace('-----BEGIN PGP SIGNATURE-----', '')
      .replace('-----END PGP SIGNATURE-----', '')
      .trim();

    try {
      Buffer.from(signatureContent, 'base64');
      return signatureContent.length > 0;
    } catch {
      return false;
    }
  }
}
