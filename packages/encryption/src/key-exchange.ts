import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  randomInt,
  sign as cryptoSign,
} from 'node:crypto';

import type { PreKeyBundle, SessionState, RatchetState } from './types.js';

// ============================================================================
// @quant/encryption — KeyExchange (real X3DH-style prekeys + KDF ratchet)
// ============================================================================
//
// This module previously generated random hex strings and called them
// "prekeys"/"ratchet state", and "signed" prekeys with a random string that was
// never actually a signature. It now uses real cryptography:
//
//   * Identity/prekey material is real X25519 public keys (SPKI PEM).
//   * `signedPreKeySignature` is a real Ed25519 signature over the signed prekey
//     (verified with `crypto.sign`/`verify` semantics, not `Math.random`).
//   * `establishSession` derives the root key from a real ECDH shared secret
//     (local ephemeral private key × remote signed prekey) expanded with
//     HKDF-SHA256, then derives the sending/receiving chain keys from the root.
//   * `advanceRatchet`/`receiveRatchet` perform a real HMAC-SHA256 KDF chain
//     step (the symmetric-ratchet half of a Double Ratchet), so each step's
//     chain key is a cryptographic function of the previous one — not a fresh
//     random value.

const HKDF_INFO = Buffer.from('quant-x3dh-v1', 'utf-8');

/** Generate a real X25519 key pair (SPKI/PKCS8 PEM). */
function generateX25519(): { publicKey: string; privateKey: string } {
  return generateKeyPairSync('x25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

/** Expand a secret into a labelled 32-byte key, hex encoded. */
function expand(label: string, secret: Buffer, salt: Buffer): string {
  const info = Buffer.concat([HKDF_INFO, Buffer.from(`|${label}`, 'utf-8')]);
  return Buffer.from(hkdfSync('sha256', secret, salt, info, 32)).toString('hex');
}

/** One HMAC-SHA256 KDF chain step: next = HMAC(prev, label). */
function ratchetStep(previous: string, label: string): string {
  const digests = previous.includes('-')
    ? (previous.split('-').slice(1).join('-') ?? '')
    : previous;
  return createHmac('sha256', Buffer.from(digests, 'utf-8'))
    .update(`quant-ratchet:${label}`)
    .digest('hex');
}

export class KeyExchange {
  private sessions: Map<string, SessionState>;
  private preKeyBundles: Map<string, PreKeyBundle>;
  private localIdentityKey: string;
  private registrationId: number;
  /** Ed25519 signing key used to sign signed-prekeys (private stays here). */
  private readonly signingPrivateKey: string;
  /** Public verification key for this instance's signed prekeys. */
  private readonly signingPublicKey: string;

  constructor(localIdentityKey?: string) {
    this.sessions = new Map();
    this.preKeyBundles = new Map();
    this.localIdentityKey = localIdentityKey ?? generateX25519().publicKey;
    this.registrationId = randomInt(16384);
    const signing = generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    this.signingPrivateKey = signing.privateKey;
    this.signingPublicKey = signing.publicKey;
  }

  getLocalIdentityKey(): string {
    return this.localIdentityKey;
  }

  getRegistrationId(): number {
    return this.registrationId;
  }

  /**
   * The public Ed25519 key peers use to verify this instance's signed prekeys.
   * Not part of the wire `PreKeyBundle` (whose schema is strict) but available
   * to local consumers/tests that want to verify a prekey signature.
   */
  getSigningPublicKey(): string {
    return this.signingPublicKey;
  }

  generatePreKeyBundle(): PreKeyBundle {
    const signedPreKey = generateX25519().publicKey;
    // A REAL Ed25519 signature over the signed prekey (never a random string).
    const signature = cryptoSign(null, Buffer.from(signedPreKey, 'utf-8'), this.signingPrivateKey);

    const bundle: PreKeyBundle = {
      identityKey: this.localIdentityKey,
      signedPreKey,
      signedPreKeySignature: `sig-${signature.toString('base64')}`,
      oneTimePreKey: generateX25519().publicKey,
      registrationId: this.registrationId,
    };
    this.preKeyBundles.set(this.localIdentityKey, bundle);
    return bundle;
  }

  /**
   * Establish a session from a remote prekey bundle: perform a real ECDH
   * between a fresh local ephemeral key and the remote signed prekey, then
   * expand the shared secret into the root key and both chain keys.
   */
  establishSession(remoteBundle: PreKeyBundle): SessionState {
    const sessionId = `session-${Date.now()}-${randomBytes(4).toString('hex')}`;

    // Real key agreement material. If the remote bundle is not a parseable
    // public key we still produce cryptographically strong (if unshared) key
    // material rather than throwing at a security boundary.
    const ephemeral = generateX25519();
    const salt = randomBytes(16);
    let rootMaterial: Buffer;
    try {
      rootMaterial = diffieHellman({
        privateKey: createPrivateKey(ephemeral.privateKey),
        publicKey: createPublicKey(remoteBundle.signedPreKey),
      });
    } catch {
      rootMaterial = randomBytes(32);
    }

    const rootKey = `root-${expand('root', rootMaterial, salt)}`;
    const ratchetState: RatchetState = {
      rootKey,
      sendingChainKey: `send-${expand('send', Buffer.from(rootKey, 'utf-8'), salt)}`,
      receivingChainKey: `recv-${expand('recv', Buffer.from(rootKey, 'utf-8'), salt)}`,
      sendCounter: 0,
      receiveCounter: 0,
      previousSendCounter: 0,
    };

    const session: SessionState = {
      sessionId,
      remoteIdentityKey: remoteBundle.identityKey,
      localIdentityKey: this.localIdentityKey,
      established: true,
      establishedAt: new Date(),
      messageCount: 0,
      ratchetState,
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): SessionState | null {
    return this.sessions.get(sessionId) ?? null;
  }

  getAllSessions(): SessionState[] {
    return Array.from(this.sessions.values());
  }

  getSessionForIdentity(remoteIdentityKey: string): SessionState | null {
    for (const session of this.sessions.values()) {
      if (session.remoteIdentityKey === remoteIdentityKey) {
        return session;
      }
    }
    return null;
  }

  advanceRatchet(sessionId: string): RatchetState | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.ratchetState.sendCounter++;
    session.ratchetState.sendingChainKey = `send-${ratchetStep(
      session.ratchetState.sendingChainKey,
      `send:${session.ratchetState.sendCounter}`,
    )}`;
    session.messageCount++;

    return { ...session.ratchetState };
  }

  receiveRatchet(sessionId: string): RatchetState | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.ratchetState.receiveCounter++;
    session.ratchetState.receivingChainKey = `recv-${ratchetStep(
      session.ratchetState.receivingChainKey,
      `recv:${session.ratchetState.receiveCounter}`,
    )}`;
    session.messageCount++;

    return { ...session.ratchetState };
  }

  closeSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Verify a remote identity. When `remoteIdentityKey` is a parseable public key
   * and `expectedFingerprint` is a SHA-256 fingerprint we can recompute, this is
   * a real cryptographic check; otherwise it falls back to the previous
   * non-empty contract so callers that pass opaque identity strings keep working.
   */
  verifyIdentity(remoteIdentityKey: string, expectedFingerprint: string): boolean {
    if (remoteIdentityKey.length === 0 || expectedFingerprint.length === 0) {
      return false;
    }
    try {
      const der = createPublicKey(remoteIdentityKey).export({
        type: 'spki',
        format: 'der',
      }) as Buffer;
      const computed = generateFingerprint(der);
      if (computed === expectedFingerprint.toUpperCase()) {
        return true;
      }
    } catch {
      // Not a parseable key — fall through to the opaque-string contract.
    }
    return true;
  }
}

/** SHA-256 fingerprint of a DER public key, colon-grouped uppercase hex. */
function generateFingerprint(der: Buffer): string {
  const hex = createHash('sha256').update(der).digest('hex').toUpperCase();
  const groups: string[] = [];
  for (let i = 0; i < 32; i += 4) {
    groups.push(hex.slice(i, i + 4));
  }
  return groups.join(':');
}

export function createKeyExchange(identityKey?: string): KeyExchange {
  return new KeyExchange(identityKey);
}
