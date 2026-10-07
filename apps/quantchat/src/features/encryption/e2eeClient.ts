// ============================================================================
// quantchat — client-side E2EE engine wrapper (Layer 5, the key-handling edge)
// ============================================================================
//
// This module is the ONLY place the `@quant/encryption` engine is exercised on
// the quantchat client, and it is where the Requirement 7.5 contract is
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

// ============================================================================
// One-time prekey replenishment (Requirement 2.8)
// ============================================================================
//
// X3DH consumes one one-time prekey per session initiation, so a user's pool
// drains over time. The client watches its remaining unclaimed count and, once
// it dips below the threshold, generates a fresh batch and tops the pool back up
// to the target. Only PUBLIC one-time prekey material is uploaded — generation
// happens here via the engine and the private/identity key material never leaves
// this module (zero-knowledge invariant, Req 16.1).

/** Replenish once the unclaimed pool drops below this many keys (Req 2.8). */
export const ONE_TIME_PREKEY_REPLENISH_THRESHOLD = 10;

/** Refill the unclaimed pool up to at least this many keys (Req 2.8). */
export const ONE_TIME_PREKEY_TARGET = 100;

/**
 * Decide how many one-time prekeys to generate given the current remaining
 * unclaimed count. Returns 0 when the pool is at or above the threshold (no
 * replenishment needed); otherwise the number needed to reach the target.
 * Pure and side-effect free so the replenishment policy is unit-testable.
 */
export function oneTimePreKeysToGenerate(remainingCount: number): number {
  if (remainingCount >= ONE_TIME_PREKEY_REPLENISH_THRESHOLD) {
    return 0;
  }
  return Math.max(0, ONE_TIME_PREKEY_TARGET - Math.max(0, remainingCount));
}

/**
 * Generate `count` fresh PUBLIC one-time prekeys via the engine. Each engine
 * prekey bundle yields a unique one-time prekey; only the PUBLIC value is
 * collected — the identity's private/ratchet material stays inside `identity`.
 */
export function generateOneTimePreKeys(identity: LocalE2EEIdentity, count: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const oneTimePreKey = identity.keyExchange.generatePreKeyBundle().oneTimePreKey;
    if (oneTimePreKey) {
      keys.push(oneTimePreKey);
    }
  }
  return keys;
}

/**
 * Transport seam for replenishment. The default implementation (see
 * `useEncryption.ts`) talks to the same-origin `/api/e2ee/prekeys*` proxy; it is
 * injected here so this module performs no inline network I/O and the policy is
 * fully testable. The transport only ever sees PUBLIC one-time prekey strings.
 */
export interface OneTimePreKeyReplenishmentTransport {
  /** Read the remaining unclaimed one-time prekey count from the backend. */
  getRemainingCount(): Promise<number>;
  /** Upload a batch (1–100) of PUBLIC one-time prekeys to the backend pool. */
  uploadOneTimePreKeys(oneTimePreKeys: string[]): Promise<void>;
}

/** Outcome of a replenishment pass. */
export interface ReplenishmentResult {
  /** Remaining unclaimed count read before any upload. */
  remainingBefore: number;
  /** Number of fresh one-time prekeys generated and uploaded (0 when skipped). */
  uploaded: number;
}

/**
 * Replenish the one-time prekey pool when it runs low (Requirement 2.8):
 * read the remaining unclaimed count; if it is below the threshold, generate
 * enough fresh PUBLIC one-time prekeys to bring the pool to the target and
 * upload them (chunked to the backend's 1–100 batch limit). When the pool is
 * already at or above the threshold this is a no-op.
 *
 * Private key material never leaves the client: generation uses the local
 * `identity`, and the transport carries only PUBLIC one-time prekey strings.
 */
export async function replenishOneTimePreKeys(
  identity: LocalE2EEIdentity,
  transport: OneTimePreKeyReplenishmentTransport,
): Promise<ReplenishmentResult> {
  const remainingBefore = await transport.getRemainingCount();
  const toGenerate = oneTimePreKeysToGenerate(remainingBefore);

  if (toGenerate === 0) {
    return { remainingBefore, uploaded: 0 };
  }

  const oneTimePreKeys = generateOneTimePreKeys(identity, toGenerate);

  // Respect the backend's 1–100 per-batch limit; a full top-up from an empty
  // pool is exactly the target, so this is typically a single batch.
  const BATCH_SIZE = 100;
  for (let offset = 0; offset < oneTimePreKeys.length; offset += BATCH_SIZE) {
    await transport.uploadOneTimePreKeys(oneTimePreKeys.slice(offset, offset + BATCH_SIZE));
  }

  return { remainingBefore, uploaded: oneTimePreKeys.length };
}
