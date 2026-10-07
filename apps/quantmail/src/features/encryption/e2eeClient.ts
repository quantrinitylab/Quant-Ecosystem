// ============================================================================
// quantmail — client-side E2EE engine wrapper (Layer 5, the key-handling edge)
// ============================================================================
//
// This module is the ONLY place the `@quant/encryption` engine is exercised on
// the quantmail client, and it is where the Requirement 7.5 contract is
// physically enforced: **key material never leaves this module**.
//
//   - Key generation / identity init  -> here (browser), via the engine.
//   - Encryption of plaintext          -> here; only the resulting CIPHERTEXT
//                                         envelope is handed to the api-client
//                                         hooks (`useRelayEncryptedMessage`).
//   - Decryption                       -> here; ciphertext pulled from the inbox
//                                         is decrypted locally with the private
//                                         key that this module holds.
//   - PreKey bundle                    -> only the PUBLIC bundle is returned for
//                                         publishing; private/ratchet state stays.
//
// The api-client hooks (`useEncryption.ts`) only ever receive the *outputs* of
// the functions below — public bundles and ciphertext — so no private key,
// session/ratchet secret, or plaintext is ever sent to the Next proxy or the
// backend relay. Encryption/decryption "goes through the engine" exactly as the
// design's per-app encryption wiring requires.

import { createE2EEManager, createKeyExchange } from '@quant/encryption';
import type { E2EEManager, KeyExchange, KeyPair } from '@quant/encryption';
import type { CiphertextEnvelope, PublicPreKeyBundle } from './types';

/**
 * A client-local E2EE identity. Everything in here that is secret
 * (`identityKeyPair.privateKey`, the `KeyExchange` ratchet state) stays in the
 * browser tab that created it — it is never serialized to the seam.
 */
export interface LocalE2EEIdentity {
  manager: E2EEManager;
  keyExchange: KeyExchange;
  identityKeyPair: KeyPair;
}

/**
 * Create a fresh client-side E2EE identity (key generation happens here, in the
 * browser, via the engine). The returned object holds private key material and
 * MUST stay client-side.
 */
export function createLocalIdentity(): LocalE2EEIdentity {
  const manager = createE2EEManager();
  const identityKeyPair = manager.initializeIdentity();
  const keyExchange = createKeyExchange(identityKeyPair.publicKey);
  return { manager, keyExchange, identityKeyPair };
}

/**
 * Produce the PUBLIC pre-key bundle to publish for key distribution. Only public
 * material is returned — the private identity key stays inside `identity`.
 */
export function exportPublicBundle(identity: LocalE2EEIdentity): PublicPreKeyBundle {
  const bundle = identity.keyExchange.generatePreKeyBundle();
  return {
    identityKey: bundle.identityKey,
    signedPreKey: bundle.signedPreKey,
    signedPreKeySignature: bundle.signedPreKeySignature,
    oneTimePreKey: bundle.oneTimePreKey,
    registrationId: bundle.registrationId,
  };
}

/**
 * Encrypt plaintext for a recipient and return ONLY the ciphertext envelope that
 * is safe to relay. The plaintext and both key pairs never leave this function.
 */
export function encryptForRecipient(
  identity: LocalE2EEIdentity,
  recipientPublicKey: KeyPair,
  plaintext: string,
): CiphertextEnvelope {
  const payload = identity.manager.encrypt(plaintext, identity.identityKeyPair, recipientPublicKey);
  // `EncryptedPayload` is already ciphertext-only; project its `Date` timestamp
  // to the wire (ISO string) shape. No secret fields exist to strip.
  return {
    ciphertext: payload.ciphertext,
    nonce: payload.nonce,
    tag: payload.tag,
    algorithm: payload.algorithm,
    senderFingerprint: payload.senderFingerprint,
    recipientFingerprint: payload.recipientFingerprint,
    timestamp:
      payload.timestamp instanceof Date
        ? payload.timestamp.toISOString()
        : String(payload.timestamp),
    version: payload.version,
  };
}

/**
 * Decrypt a ciphertext envelope pulled from the inbox, locally, using the
 * client-held private key. Plaintext is produced here and never sent anywhere.
 */
export function decryptEnvelope(identity: LocalE2EEIdentity, envelope: CiphertextEnvelope): string {
  return identity.manager.decrypt(
    {
      ciphertext: envelope.ciphertext,
      nonce: envelope.nonce,
      tag: envelope.tag,
      algorithm: envelope.algorithm,
      senderFingerprint: envelope.senderFingerprint,
      recipientFingerprint: envelope.recipientFingerprint,
      timestamp: new Date(envelope.timestamp),
      version: envelope.version,
    },
    identity.identityKeyPair,
  );
}
