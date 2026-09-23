import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: string; // hex
  tag: string; // hex
  checksumSha256: string; // hex of original plaintext
}

export class VaultCrypto {
  /**
   * Compresses with gzip and encrypts with AES-256-GCM.
   */
  static async compressAndEncrypt(data: Buffer, secretKeyHex: string): Promise<EncryptedPayload> {
    const key = Buffer.from(secretKeyHex, 'hex');
    if (key.length !== 32) {
      throw new Error('AES-256 key must be exactly 32 bytes (64 hex characters)');
    }

    const checksumSha256 = crypto.createHash('sha256').update(data).digest('hex');
    const compressed = await gzipAsync(data);

    const iv = crypto.randomBytes(12); // standard 96-bit IV for AES-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      ciphertext,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      checksumSha256,
    };
  }

  /**
   * Decrypts with AES-256-GCM and decompresses with gunzip.
   * Throws if tag does not match or data is corrupted.
   */
  static async decryptAndDecompress(
    ciphertext: Buffer,
    secretKeyHex: string,
    ivHex: string,
    tagHex: string,
  ): Promise<Buffer> {
    const key = Buffer.from(secretKeyHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    const compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const decompressed = await gunzipAsync(compressed);
    return decompressed;
  }
}
