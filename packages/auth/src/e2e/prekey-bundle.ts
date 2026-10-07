// ============================================================================
// E2E - PreKey Bundle Service
// One-time prekeys + signed prekey for offline message initiation
// ============================================================================

import * as crypto from 'node:crypto';
import type { IdentityKeyPair } from './identity-key';

export interface SignedPreKey {
  keyPair: { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject };
  signature: Buffer;
  keyId: number;
}

export interface OneTimePreKey {
  keyPair: { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject };
  keyId: number;
}

export interface PreKeyBundle {
  identityPublicKey: crypto.KeyObject;
  signedPreKey: SignedPreKey;
  oneTimePreKeys: OneTimePreKey[];
}

export class PreKeyBundleService {
  /**
   * Generate a signed prekey (X25519 for DH) signed by the identity key (Ed25519)
   */
  generateSignedPreKey(identityKey: IdentityKeyPair, keyId: number = 1): SignedPreKey {
    const keyPair = crypto.generateKeyPairSync('x25519');
    const publicKeyDer = keyPair.publicKey.export({ type: 'spki', format: 'der' });
    const signature = crypto.sign(null, Buffer.from(publicKeyDer), identityKey.privateKey);

    return { keyPair, signature, keyId };
  }

  /**
   * Generate a batch of one-time prekeys (X25519)
   */
  generateOneTimePreKeys(count: number, startId: number = 0): OneTimePreKey[] {
    const preKeys: OneTimePreKey[] = [];
    for (let i = 0; i < count; i++) {
      const keyPair = crypto.generateKeyPairSync('x25519');
      preKeys.push({ keyPair, keyId: startId + i });
    }
    return preKeys;
  }

  /**
   * Create a full prekey bundle for publishing to the server
   */
  createBundle(
    identityKey: IdentityKeyPair,
    signedPreKey: SignedPreKey,
    oneTimePreKeys: OneTimePreKey[],
  ): PreKeyBundle {
    return {
      identityPublicKey: identityKey.publicKey,
      signedPreKey,
      oneTimePreKeys,
    };
  }

  /**
   * Verify the signed prekey signature against the identity public key
   */
  verifySignedPreKey(identityPublicKey: crypto.KeyObject, signedPreKey: SignedPreKey): boolean {
    const publicKeyDer = signedPreKey.keyPair.publicKey.export({ type: 'spki', format: 'der' });
    return crypto.verify(
      null,
      Buffer.from(publicKeyDer),
      identityPublicKey,
      signedPreKey.signature,
    );
  }
}
