// ============================================================================
// E2E - Device Linking Service
// QR code + secure channel for linking new device
// ============================================================================

import * as crypto from 'node:crypto';

export interface LinkingCode {
  code: string;
  ephemeralKeyPair: {
    publicKey: crypto.KeyObject;
    privateKey: crypto.KeyObject;
  };
  challenge: string;
  expiresAt: number;
}

export interface LinkingSession {
  sharedSecret: Buffer;
  verified: boolean;
  devicePublicKey: crypto.KeyObject | null;
}

export class DeviceLinkingService {
  private readonly CODE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Generate a linking code for display as QR code
   */
  generateLinkingCode(): LinkingCode {
    const ephemeralKeyPair = crypto.generateKeyPairSync('x25519');
    const challenge = crypto.randomBytes(32).toString('hex');
    const publicKeyDer = ephemeralKeyPair.publicKey.export({
      type: 'spki',
      format: 'der',
    });
    const code = Buffer.from(publicKeyDer).toString('base64') + '.' + challenge;

    return {
      code,
      ephemeralKeyPair,
      challenge,
      expiresAt: Date.now() + this.CODE_EXPIRY_MS,
    };
  }

  /**
   * Verify a linking code from the new device
   */
  verifyLinkingCode(linkingCode: LinkingCode, devicePublicKey: crypto.KeyObject): LinkingSession {
    if (Date.now() > linkingCode.expiresAt) {
      throw new Error('Linking code expired');
    }

    // Compute shared secret via ECDH
    const sharedSecret = crypto.diffieHellman({
      privateKey: linkingCode.ephemeralKeyPair.privateKey,
      publicKey: devicePublicKey,
    });

    return {
      sharedSecret,
      verified: true,
      devicePublicKey,
    };
  }

  /**
   * Transfer keys over the secure channel established by linking
   */
  transferKeys(
    linkingSession: LinkingSession,
    keysToTransfer: Buffer,
  ): { ciphertext: Buffer; nonce: Buffer; authTag: Buffer; salt: Buffer } {
    if (!linkingSession.verified) {
      throw new Error('Linking session not verified');
    }

    // Generate a random salt for HKDF derivation
    const salt = crypto.randomBytes(32);

    // Derive encryption key from shared secret
    const encKey = Buffer.from(
      crypto.hkdfSync('sha256', linkingSession.sharedSecret, salt, 'DeviceLinkingTransfer', 32),
    );

    // Encrypt the keys
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encKey, nonce);
    const ciphertext = Buffer.concat([cipher.update(keysToTransfer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return { ciphertext, nonce, authTag, salt };
  }

  /**
   * Receive transferred keys on the new device
   */
  receiveKeys(
    sharedSecret: Buffer,
    ciphertext: Buffer,
    nonce: Buffer,
    authTag: Buffer,
    salt: Buffer,
  ): Buffer {
    const decKey = Buffer.from(
      crypto.hkdfSync('sha256', sharedSecret, salt, 'DeviceLinkingTransfer', 32),
    );

    const decipher = crypto.createDecipheriv('aes-256-gcm', decKey, nonce);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}
