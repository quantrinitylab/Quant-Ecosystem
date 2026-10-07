// ============================================================================
// E2E - Sealed Sender
// Hide sender identity from server
// ============================================================================

import * as crypto from 'node:crypto';

export interface SealedMessage {
  ephemeralPublicKey: string;
  salt: string;
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
}

export interface UnsealedMessage {
  senderIdentityPublicKey: string;
  plaintext: Buffer;
}

export class SealedSenderService {
  /**
   * Seal a message: encrypts sender info + content so only the recipient
   * can see who sent the message. Server only sees the recipient.
   */
  seal(
    senderIdentityPublicKey: crypto.KeyObject,
    recipientPublicKey: crypto.KeyObject,
    plaintext: Buffer,
  ): SealedMessage {
    // Generate ephemeral X25519 keypair for the sealed sender envelope
    const ephemeral = crypto.generateKeyPairSync('x25519');

    // Derive a shared secret using ephemeral private + recipient public
    const sharedSecret = crypto.diffieHellman({
      privateKey: ephemeral.privateKey,
      publicKey: recipientPublicKey,
    });

    // Derive encryption key via HKDF with a random salt
    const salt = crypto.randomBytes(32);
    const encKey = Buffer.from(crypto.hkdfSync('sha256', sharedSecret, salt, 'SealedSender', 32));

    // Serialize sender identity for inclusion in the envelope
    const senderDer = senderIdentityPublicKey.export({ type: 'spki', format: 'der' });
    const senderB64 = Buffer.from(senderDer).toString('base64');

    // Create payload: sender identity + plaintext
    const senderLengthBuf = Buffer.alloc(4);
    senderLengthBuf.writeUInt32BE(senderB64.length, 0);
    const payload = Buffer.concat([senderLengthBuf, Buffer.from(senderB64, 'utf8'), plaintext]);

    // Encrypt
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encKey, nonce);
    const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Export ephemeral public key for the envelope
    const ephemeralPublicDer = ephemeral.publicKey.export({ type: 'spki', format: 'der' });

    return {
      ephemeralPublicKey: Buffer.from(ephemeralPublicDer).toString('base64'),
      salt: salt.toString('base64'),
      ciphertext,
      nonce,
      authTag,
    };
  }

  /**
   * Unseal a message: recipient decrypts to reveal sender identity and plaintext
   */
  unseal(recipientPrivateKey: crypto.KeyObject, sealedMessage: SealedMessage): UnsealedMessage {
    // Recover ephemeral public key
    const ephemeralPublicDer = Buffer.from(sealedMessage.ephemeralPublicKey, 'base64');
    const ephemeralPublicKey = crypto.createPublicKey({
      key: ephemeralPublicDer,
      format: 'der',
      type: 'spki',
    });

    // Derive shared secret
    const sharedSecret = crypto.diffieHellman({
      privateKey: recipientPrivateKey,
      publicKey: ephemeralPublicKey,
    });

    // Derive decryption key using the salt from the sealed message
    const salt = Buffer.from(sealedMessage.salt, 'base64');
    const decKey = Buffer.from(crypto.hkdfSync('sha256', sharedSecret, salt, 'SealedSender', 32));

    // Decrypt
    const decipher = crypto.createDecipheriv('aes-256-gcm', decKey, sealedMessage.nonce);
    decipher.setAuthTag(sealedMessage.authTag);
    const payload = Buffer.concat([decipher.update(sealedMessage.ciphertext), decipher.final()]);

    // Parse payload
    const senderLength = payload.readUInt32BE(0);
    const senderB64 = payload.subarray(4, 4 + senderLength).toString('utf8');
    const plaintext = payload.subarray(4 + senderLength);

    return {
      senderIdentityPublicKey: senderB64,
      plaintext: Buffer.from(plaintext),
    };
  }
}
