import crypto from 'node:crypto';

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  authTag: string;
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit for GCM

export class FieldEncryption {
  private readonly masterKey: string;

  constructor(masterKey: string) {
    this.masterKey = masterKey;
  }

  encrypt(plaintext: string, key: Buffer): EncryptedData {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  }

  decrypt(ciphertext: string, iv: string, authTag: string, key: Buffer): string {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  rotateKey(encryptedData: EncryptedData, oldKey: Buffer, newKey: Buffer): EncryptedData {
    const plaintext = this.decrypt(
      encryptedData.ciphertext,
      encryptedData.iv,
      encryptedData.authTag,
      oldKey,
    );
    return this.encrypt(plaintext, newKey);
  }

  deriveKey(masterKey: string, context: string): Buffer {
    const derived = crypto.hkdfSync(
      'sha256',
      Buffer.from(masterKey, 'utf8'),
      Buffer.alloc(0),
      Buffer.from(context, 'utf8'),
      32,
    );
    return Buffer.from(derived);
  }

  getDerivedKey(context: string): Buffer {
    return this.deriveKey(this.masterKey, context);
  }
}

export function createFieldEncryption(masterKey: string): FieldEncryption {
  return new FieldEncryption(masterKey);
}
