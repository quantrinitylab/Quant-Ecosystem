import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

import type {
  E2EEConfig,
  KeyPair,
  EncryptedPayload,
  KeyRotationPolicy,
  DeviceKey,
  EncryptionAlgorithm,
} from './types.js';

// ============================================================================
// @quant/encryption — real end-to-end encryption engine
// ============================================================================
//
// This module used to be a placeholder: `encrypt()` base64-encoded the
// plaintext, `nonce`/`tag` came from `Math.random()`, and `decrypt()` merely
// base64-decoded. That offered ZERO confidentiality while the zero-knowledge
// relay in quantchat/quantmail advertised "end-to-end encryption".
//
// It is now a genuine public-key encryption scheme (ECIES / sealed box):
//
//   * Key pairs are real X25519 keys (Node's audited `crypto` module).
//   * `encrypt` seals to the recipient's PUBLIC key: it generates an ephemeral
//     X25519 keypair per message, performs ECDH against the recipient's public
//     key, derives a 256-bit message key with HKDF-SHA256, and encrypts under an
//     authenticated cipher (AES-256-GCM, or ChaCha20-Poly1305).
//   * `decrypt` reconstructs the same HKDF key from the ephemeral public key and
//     the recipient's PRIVATE key, then authenticates + decrypts. A tampered
//     ciphertext, IV, tag, ephemeral key, salt, or fingerprint fails closed.
//   * The AEAD associated data binds the cipher name and both fingerprints, so
//     envelope metadata cannot be silently rewritten.
//   * Fingerprints are SHA-256 of the public-key DER (no longer random).
//
// The recipient's private key is the only secret required to read a message;
// the ephemeral private key never leaves `encrypt` and is discarded with the
// envelope.

/** HKDF `info` domain-separation label for the E2EE message key. */
const HKDF_INFO = Buffer.from('quant-e2ee-v1', 'utf-8');

/** AEAD associated-data domain-separation label. */
const AAD_LABEL = 'quant-e2ee-envelope-v1';

/**
 * Sealed-box envelope carried (base64) inside `EncryptedPayload.ciphertext`.
 * Contains only public/opaque material: the sender's ephemeral public key, the
 * HKDF salt, the IV, the AEAD auth tag and the ciphertext.
 */
interface SealedEnvelope {
  v: 1;
  /** Ephemeral X25519 public key (SPKI PEM) used for this message's ECDH. */
  epk: string;
  /** HKDF salt, base64. */
  salt: string;
  /** AEAD IV/nonce, base64. */
  iv: string;
  /** AEAD authentication tag, base64. */
  tag: string;
  /** AEAD ciphertext, base64. */
  ct: string;
  /** AEAD cipher actually used (bound into the AAD). */
  alg: 'aes-256-gcm' | 'chacha20-poly1305';
}

/** Map the declared algorithm to a real AEAD cipher Node can run. */
function aeadCipher(algorithm: EncryptionAlgorithm): 'aes-256-gcm' | 'chacha20-poly1305' {
  // Node has no native XChaCha20-Poly1305; ChaCha20-Poly1305 is the nearest
  // genuine 256-bit AEAD and is used as the concrete cipher.
  return algorithm === 'aes-256-gcm' ? 'aes-256-gcm' : 'chacha20-poly1305';
}

/** Reject any cipher name that is not one we actually implement. */
function assertCipher(alg: unknown): 'aes-256-gcm' | 'chacha20-poly1305' {
  if (alg === 'aes-256-gcm' || alg === 'chacha20-poly1305') {
    return alg;
  }
  throw new Error(`Unsupported E2EE cipher: ${String(alg)}`);
}

/** Derive the 256-bit per-message AEAD key from the ECDH secret. */
function deriveMessageKey(sharedSecret: Buffer, salt: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', sharedSecret, salt, HKDF_INFO, 32));
}

/** AEAD associated data binding the cipher and both identity fingerprints. */
function envelopeAad(
  senderFingerprint: string,
  recipientFingerprint: string,
  cipher: string,
): Buffer {
  return Buffer.from(
    `${AAD_LABEL}|${cipher}|${senderFingerprint}|${recipientFingerprint}`,
    'utf-8',
  );
}

/** Real SHA-256 fingerprint of a PEM-encoded public key (colon-grouped hex). */
function fingerprintOf(publicKeyPem: string): string {
  const der = Buffer.from(
    publicKeyPem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''),
    'base64',
  );
  const hex = createHash('sha256').update(der).digest('hex').toUpperCase();
  const groups: string[] = [];
  for (let i = 0; i < 32; i += 4) {
    groups.push(hex.slice(i, i + 4));
  }
  return groups.join(':');
}

/** Parse and structurally validate a sealed envelope from the wire. */
function parseSealedEnvelope(ciphertext: string): SealedEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(ciphertext, 'base64').toString('utf-8'));
  } catch {
    throw new Error('Invalid encrypted payload: ciphertext is not a sealed envelope');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Invalid encrypted payload: malformed envelope');
  }
  const env = parsed as Record<string, unknown>;
  if (
    env['v'] !== 1 ||
    typeof env['epk'] !== 'string' ||
    typeof env['salt'] !== 'string' ||
    typeof env['iv'] !== 'string' ||
    typeof env['tag'] !== 'string' ||
    typeof env['ct'] !== 'string'
  ) {
    throw new Error('Invalid encrypted payload: malformed envelope');
  }

  return {
    v: 1,
    epk: env['epk'],
    salt: env['salt'],
    iv: env['iv'],
    tag: env['tag'],
    ct: env['ct'],
    alg: assertCipher(env['alg']),
  };
}

export class E2EEManager {
  private config: E2EEConfig;
  private deviceKeys: Map<string, DeviceKey>;
  private identityKeyPair: KeyPair | null;
  private rotationTimers: Map<string, ReturnType<typeof setTimeout>>;

  constructor(config?: Partial<E2EEConfig>) {
    this.config = {
      algorithm: config?.algorithm ?? 'aes-256-gcm',
      keyRotationPolicy: config?.keyRotationPolicy ?? {
        enabled: true,
        intervalDays: 30,
        maxKeyAge: 90,
        autoRotate: true,
        notifyBeforeExpiry: true,
        notifyDays: 7,
      },
      zeroKnowledge: config?.zeroKnowledge ?? true,
      encryptAtRest: config?.encryptAtRest ?? true,
      encryptInTransit: config?.encryptInTransit ?? true,
      enabled: true,
      defaultOn: true,
    };
    this.deviceKeys = new Map();
    this.identityKeyPair = null;
    this.rotationTimers = new Map();
  }

  getConfig(): E2EEConfig {
    return { ...this.config };
  }

  isEnabled(): boolean {
    return this.config.enabled && this.config.defaultOn;
  }

  isZeroKnowledge(): boolean {
    return this.config.zeroKnowledge;
  }

  /** Generate a real X25519 key pair with a real SHA-256 fingerprint. */
  generateKeyPair(algorithm?: EncryptionAlgorithm): KeyPair {
    const algo = algorithm ?? this.config.algorithm;
    const pair = generateKeyPairSync('x25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const now = new Date();
    return {
      publicKey: pair.publicKey,
      privateKey: pair.privateKey,
      algorithm: algo,
      createdAt: now,
      expiresAt: this.config.keyRotationPolicy.enabled
        ? new Date(now.getTime() + this.config.keyRotationPolicy.intervalDays * 86400000)
        : null,
      fingerprint: fingerprintOf(pair.publicKey),
    };
  }

  initializeIdentity(): KeyPair {
    this.identityKeyPair = this.generateKeyPair();
    return this.identityKeyPair;
  }

  getIdentityKeyPair(): KeyPair | null {
    return this.identityKeyPair;
  }

  registerDevice(deviceId: string, deviceName: string): DeviceKey {
    const keyPair = this.generateKeyPair();
    const deviceKey: DeviceKey = {
      deviceId,
      deviceName,
      keyPair,
      trusted: true,
      lastActive: new Date(),
      registeredAt: new Date(),
    };
    this.deviceKeys.set(deviceId, deviceKey);
    return deviceKey;
  }

  getDeviceKeys(): DeviceKey[] {
    return Array.from(this.deviceKeys.values());
  }

  getDeviceKey(deviceId: string): DeviceKey | null {
    return this.deviceKeys.get(deviceId) ?? null;
  }

  revokeDevice(deviceId: string): boolean {
    return this.deviceKeys.delete(deviceId);
  }

  trustDevice(deviceId: string): boolean {
    const device = this.deviceKeys.get(deviceId);
    if (!device) return false;
    device.trusted = true;
    return true;
  }

  untrustDevice(deviceId: string): boolean {
    const device = this.deviceKeys.get(deviceId);
    if (!device) return false;
    device.trusted = false;
    return true;
  }

  /**
   * Seal `plaintext` to `recipientKey`'s PUBLIC key. The plaintext is encrypted
   * with a per-message HKDF-derived AEAD key; only the recipient's private key
   * can open the resulting envelope.
   */
  encrypt(plaintext: string, senderKey: KeyPair, recipientKey: KeyPair): EncryptedPayload {
    const cipher = aeadCipher(this.config.algorithm);

    // Parse eagerly so a malformed recipient key fails closed rather than
    // producing an unopenable envelope.
    const recipientPublicKey = createPublicKey(recipientKey.publicKey);

    // Ephemeral sender key for this single message (forward secrecy primitive).
    const ephemeral = generateKeyPairSync('x25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const sharedSecret = diffieHellman({
      privateKey: createPrivateKey(ephemeral.privateKey),
      publicKey: recipientPublicKey,
    });

    const salt = randomBytes(16);
    const messageKey = deriveMessageKey(sharedSecret, salt);
    const iv = randomBytes(12);

    const aad = envelopeAad(senderKey.fingerprint, recipientKey.fingerprint, cipher);
    const encrypter = createCipheriv(cipher, messageKey, iv);
    encrypter.setAAD(aad);
    const ciphertextBytes = Buffer.concat([
      encrypter.update(Buffer.from(plaintext, 'utf-8')),
      encrypter.final(),
    ]);
    const tag = encrypter.getAuthTag();

    const envelope: SealedEnvelope = {
      v: 1,
      epk: ephemeral.publicKey,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ct: ciphertextBytes.toString('base64'),
      alg: cipher,
    };

    return {
      ciphertext: Buffer.from(JSON.stringify(envelope), 'utf-8').toString('base64'),
      nonce: `nonce-${iv.toString('base64')}`,
      tag: `tag-${tag.toString('base64')}`,
      algorithm: this.config.algorithm,
      senderFingerprint: senderKey.fingerprint,
      recipientFingerprint: recipientKey.fingerprint,
      timestamp: new Date(),
      version: 1,
    };
  }

  /**
   * Open a sealed envelope with the recipient's PRIVATE key. Throws on any
   * tampering (AEAD authentication failure) instead of returning plaintext.
   */
  decrypt(payload: EncryptedPayload, recipientKey: KeyPair): string {
    const envelope = parseSealedEnvelope(payload.ciphertext);

    const sharedSecret = diffieHellman({
      privateKey: createPrivateKey(recipientKey.privateKey),
      publicKey: createPublicKey(envelope.epk),
    });
    const messageKey = deriveMessageKey(sharedSecret, Buffer.from(envelope.salt, 'base64'));

    // Auth-fail here (bad iv/tag/ct/epk/salt) means the message was tampered
    // with or addressed to a different key — fail closed.
    const aad = envelopeAad(payload.senderFingerprint, payload.recipientFingerprint, envelope.alg);
    const decrypter = createDecipheriv(
      envelope.alg,
      messageKey,
      Buffer.from(envelope.iv, 'base64'),
    );
    decrypter.setAAD(aad);
    decrypter.setAuthTag(Buffer.from(envelope.tag, 'base64'));

    const plaintext = Buffer.concat([
      decrypter.update(Buffer.from(envelope.ct, 'base64')),
      decrypter.final(),
    ]);
    return plaintext.toString('utf-8');
  }

  rotateKey(deviceId: string): DeviceKey | null {
    const device = this.deviceKeys.get(deviceId);
    if (!device) return null;

    const newKeyPair = this.generateKeyPair();
    device.keyPair = newKeyPair;
    device.lastActive = new Date();
    return device;
  }

  getRotationPolicy(): KeyRotationPolicy {
    return { ...this.config.keyRotationPolicy };
  }

  needsRotation(keyPair: KeyPair): boolean {
    if (!this.config.keyRotationPolicy.enabled) return false;
    if (!keyPair.expiresAt) return false;
    return new Date() >= keyPair.expiresAt;
  }

  shouldNotifyExpiry(keyPair: KeyPair): boolean {
    if (!this.config.keyRotationPolicy.notifyBeforeExpiry) return false;
    if (!keyPair.expiresAt) return false;
    const notifyAt = new Date(
      keyPair.expiresAt.getTime() - this.config.keyRotationPolicy.notifyDays * 86400000,
    );
    return new Date() >= notifyAt;
  }

  destroy(): void {
    for (const timer of this.rotationTimers.values()) {
      clearTimeout(timer);
    }
    this.rotationTimers.clear();
    this.deviceKeys.clear();
    this.identityKeyPair = null;
  }
}

export function createE2EEManager(config?: Partial<E2EEConfig>): E2EEManager {
  return new E2EEManager(config);
}
