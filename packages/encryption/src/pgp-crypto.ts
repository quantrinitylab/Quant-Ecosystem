// ============================================================================
// @quant/encryption — real asymmetric crypto primitives (no @simulated paths)
// ============================================================================
//
// Requirement 2.3: route all signing/encryption operations through
// @quant/encryption REAL cryptographic primitives and leave no reachable
// `@simulated` crypto code path. This module provides genuine RSA public-key
// cryptography built on Node's audited `crypto` module:
//
//   - generateKeyPair  -> real RSA-4096 keypair; the private key is exported as
//                         a passphrase-encrypted PKCS#8 PEM (never bare).
//   - encrypt          -> hybrid encryption: a random AES-256-GCM session key
//                         encrypts the message, and that session key is sealed
//                         to the RECIPIENT'S PUBLIC KEY with RSA-OAEP(SHA-256).
//                         The session key is therefore NOT recoverable from the
//                         ciphertext alone (the previous demo embedded it).
//   - decrypt          -> RSA-OAEP unseal of the session key with the private
//                         key, then AES-256-GCM open (authenticated).
//   - sign / verify    -> real RSA-SHA256 signatures verified against the
//                         message AND the signer's public key (the previous demo
//                         returned `true` for any well-formed base64).
//
// All operations are deterministic about failure: tampered ciphertext fails the
// GCM auth tag, and a forged/own-key signature fails `crypto.verify`.

import {
  constants,
  createCipheriv,
  createDecipheriv,
  createHash,
  generateKeyPairSync,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';

const PGP_PUBLIC_HEADER = '-----BEGIN PGP PUBLIC KEY-----';
const PGP_PUBLIC_FOOTER = '-----END PGP PUBLIC KEY-----';
const PGP_MESSAGE_HEADER = '-----BEGIN PGP MESSAGE-----';
const PGP_MESSAGE_FOOTER = '-----END PGP MESSAGE-----';
const PGP_SIGNATURE_HEADER = '-----BEGIN PGP SIGNATURE-----';
const PGP_SIGNATURE_FOOTER = '-----END PGP SIGNATURE-----';

/** A freshly minted keypair. The private key is a passphrase-encrypted PEM. */
export interface PgpKeyMaterial {
  /** Armored public key (safe to publish/persist). */
  publicKey: string;
  /** Passphrase-encrypted PKCS#8 private key PEM (store only via the KeyVault). */
  privateKeyPem: string;
  /** Public-key fingerprint (uppercased SHA-1 hex, 40 chars). */
  fingerprint: string;
  /** Algorithm label. */
  algorithm: string;
}

interface MessageEnvelope {
  v: 1;
  /** RSA-OAEP-sealed AES session key, base64. */
  ek: string;
  /** AES-GCM IV, base64. */
  iv: string;
  /** AES-GCM auth tag, base64. */
  tag: string;
  /** AES-GCM ciphertext, base64. */
  ct: string;
}

function armor(header: string, footer: string, payload: string): string {
  return `${header}\n${payload}\n${footer}`;
}

function dearmor(text: string, header: string, footer: string): string {
  return text.replace(header, '').replace(footer, '').trim();
}

/** Convert an armored PGP-style public key block back to a PEM Node can read. */
function toPublicKeyPem(armored: string): string {
  if (armored.includes('-----BEGIN PUBLIC KEY-----')) {
    return armored;
  }
  const body = dearmor(armored, PGP_PUBLIC_HEADER, PGP_PUBLIC_FOOTER);
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
}

/**
 * Real RSA cryptography. Stateless; instances are cheap. The RSA modulus length
 * is configurable for test speed but defaults to 4096 bits for production-grade
 * strength.
 */
export class PgpCrypto {
  constructor(private readonly modulusLength: number = 4096) {}

  /** Generate a real RSA keypair; the private key PEM is passphrase-encrypted. */
  generateKeyPair(passphrase: string): PgpKeyMaterial {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: this.modulusLength,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
        cipher: 'aes-256-cbc',
        passphrase,
      },
    });

    const spkiDer = createHash('sha1');
    // Fingerprint over the canonical DER of the public key.
    const publicDer = Buffer.from(
      publicKey.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''),
      'base64',
    );
    const fingerprint = spkiDer.update(publicDer).digest('hex').toUpperCase().slice(0, 40);

    const body = publicKey
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .trim();

    return {
      publicKey: armor(PGP_PUBLIC_HEADER, PGP_PUBLIC_FOOTER, body),
      privateKeyPem: privateKey,
      fingerprint,
      algorithm: `RSA-${this.modulusLength}`,
    };
  }

  /** Hybrid-encrypt `message` to the recipient's public key (RSA-OAEP + AES-GCM). */
  encrypt(message: string, recipientPublicKey: string): string {
    const sessionKey = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', sessionKey, iv);
    const ct = Buffer.concat([cipher.update(Buffer.from(message, 'utf-8')), cipher.final()]);
    const tag = cipher.getAuthTag();

    const sealedKey = publicEncrypt(
      {
        key: toPublicKeyPem(recipientPublicKey),
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      sessionKey,
    );

    const envelope: MessageEnvelope = {
      v: 1,
      ek: sealedKey.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ct: ct.toString('base64'),
    };
    const payload = Buffer.from(JSON.stringify(envelope)).toString('base64');
    return armor(PGP_MESSAGE_HEADER, PGP_MESSAGE_FOOTER, payload);
  }

  /** Decrypt an envelope using the passphrase-protected private key PEM. */
  decrypt(encryptedMessage: string, privateKeyPem: string, passphrase: string): string {
    const payload = dearmor(encryptedMessage, PGP_MESSAGE_HEADER, PGP_MESSAGE_FOOTER);
    const envelope = JSON.parse(
      Buffer.from(payload, 'base64').toString('utf-8'),
    ) as MessageEnvelope;

    const sessionKey = privateDecrypt(
      {
        key: privateKeyPem,
        passphrase,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(envelope.ek, 'base64'),
    );

    const decipher = createDecipheriv('aes-256-gcm', sessionKey, Buffer.from(envelope.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(envelope.ct, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf-8');
  }

  /** Produce a real RSA-SHA256 signature over `message`. */
  signMessage(message: string, privateKeyPem: string, passphrase: string): string {
    const signature = cryptoSign('sha256', Buffer.from(message, 'utf-8'), {
      key: privateKeyPem,
      passphrase,
    });
    return armor(PGP_SIGNATURE_HEADER, PGP_SIGNATURE_FOOTER, signature.toString('base64'));
  }

  /** Verify a signature against the message AND the signer's public key. */
  verifySignature(message: string, signature: string, publicKey: string): boolean {
    const sigB64 = dearmor(signature, PGP_SIGNATURE_HEADER, PGP_SIGNATURE_FOOTER);
    if (sigB64.length === 0) {
      return false;
    }
    try {
      return cryptoVerify(
        'sha256',
        Buffer.from(message, 'utf-8'),
        toPublicKeyPem(publicKey),
        Buffer.from(sigB64, 'base64'),
      );
    } catch {
      return false;
    }
  }
}

export function createPgpCrypto(modulusLength?: number): PgpCrypto {
  return new PgpCrypto(modulusLength);
}
