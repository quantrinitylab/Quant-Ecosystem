// ============================================================================
// quantmail — E2EE relay/registry (Layer 2 collaborator for the encryption seam)
// ============================================================================
//
// SECURITY CONTRACT (Requirement 7.5 — E2EE, design "Security Considerations"):
// the encryption seam transports **CIPHERTEXT ONLY**. This server-side store
// holds *exclusively* material that is, by construction, safe for the backend to
// see:
//
//   1. PUBLIC key-distribution bundles (`@quant/encryption` `PreKeyBundle`) —
//      identity/signed-pre/one-time **public** keys + a registration id. These
//      are *meant* to be published so peers can start a session; they contain
//      NO private key.
//   2. CIPHERTEXT envelopes (`@quant/encryption` `EncryptedPayload`) — opaque
//      `ciphertext` + `nonce` + `tag` + public fingerprints. The backend can
//      neither read nor decrypt these.
//
// The backend MUST NEVER receive or persist:
//   - private keys (`KeyPair.privateKey`),
//   - symmetric/session/ratchet secrets (`RatchetState.rootKey`, chain keys),
//   - plaintext message bodies.
//
// All key generation, encryption, and decryption happen CLIENT-SIDE via the
// `@quant/encryption` engine (see `apps/quantmail/src/features/encryption/`).
// This relay only *registers public bundles* and *relays opaque ciphertext*
// between authenticated users — it is a dumb, zero-knowledge mailbox.
//
// Persistence is in-memory (decorated once at boot in `buildApp()`): no new
// persistent database schema is introduced (Requirement 9.5).

import type { PreKeyBundle, EncryptedPayload } from '@quant/encryption';

/**
 * A peer's PUBLIC pre-key bundle as registered with the relay. The bundle is the
 * engine's `PreKeyBundle` verbatim (public material only) plus the owning user /
 * device and a publish timestamp the relay stamps on receipt.
 */
export interface PublishedKeyBundle {
  userId: string;
  deviceId: string;
  /** Public key-distribution material — NEVER a private key (Req 7.5). */
  bundle: PreKeyBundle;
  publishedAt: number;
}

/**
 * The JSON projection of an `@quant/encryption` `EncryptedPayload` as it crosses
 * the wire (the engine types `timestamp` as a `Date`; over JSON it is an ISO
 * string). Every field here is ciphertext or public metadata — there is no
 * plaintext and no key material.
 */
export interface CiphertextEnvelope {
  ciphertext: string;
  nonce: string;
  tag: string;
  algorithm: EncryptedPayload['algorithm'];
  senderFingerprint: string;
  recipientFingerprint: string;
  timestamp: string;
  version: number;
}

/** A relayed ciphertext envelope addressed from one user to another. */
export interface RelayedEnvelope {
  id: string;
  senderId: string;
  recipientId: string;
  /** Opaque to the backend — relayed as-is, never decrypted (Req 7.5). */
  payload: CiphertextEnvelope;
  /** Optional client-chosen session/conversation correlator (not a secret). */
  sessionId?: string;
  relayedAt: number;
}

export interface DrainInboxOptions {
  /** Cap the number of envelopes returned in one drain. */
  limit?: number;
}

/**
 * The zero-knowledge E2EE relay surface decorated onto the Fastify instance.
 * Implementations store/relay ONLY public bundles + ciphertext (Req 7.5).
 */
export interface E2EERelay {
  /** Register/replace a user+device PUBLIC pre-key bundle for key distribution. */
  publishBundle(userId: string, deviceId: string, bundle: PreKeyBundle): PublishedKeyBundle;
  /** Fetch a peer's published PUBLIC bundles so the caller can start a session. */
  getBundles(userId: string): PublishedKeyBundle[];
  /** Relay an opaque ciphertext envelope to a recipient's inbox. */
  relayEnvelope(input: {
    senderId: string;
    recipientId: string;
    payload: CiphertextEnvelope;
    sessionId?: string;
  }): RelayedEnvelope;
  /** Drain (read + remove) the ciphertext envelopes addressed to a recipient. */
  drainInbox(recipientId: string, options?: DrainInboxOptions): RelayedEnvelope[];
  /** Release in-memory state (called from the Fastify `onClose` hook). */
  shutdown(): void;
}

/**
 * In-memory, zero-knowledge implementation of {@link E2EERelay}. Holds only
 * public bundles and opaque ciphertext envelopes — by construction it cannot
 * leak key material or plaintext because none is ever stored.
 */
export class InMemoryE2EERelay implements E2EERelay {
  // userId -> (deviceId -> public bundle)
  private readonly bundles = new Map<string, Map<string, PublishedKeyBundle>>();
  // recipientId -> queued ciphertext envelopes
  private readonly inboxes = new Map<string, RelayedEnvelope[]>();
  private counter = 0;

  publishBundle(userId: string, deviceId: string, bundle: PreKeyBundle): PublishedKeyBundle {
    const record: PublishedKeyBundle = {
      userId,
      deviceId,
      bundle,
      publishedAt: Date.now(),
    };
    let byDevice = this.bundles.get(userId);
    if (!byDevice) {
      byDevice = new Map();
      this.bundles.set(userId, byDevice);
    }
    byDevice.set(deviceId, record);
    return record;
  }

  getBundles(userId: string): PublishedKeyBundle[] {
    const byDevice = this.bundles.get(userId);
    return byDevice ? Array.from(byDevice.values()) : [];
  }

  relayEnvelope(input: {
    senderId: string;
    recipientId: string;
    payload: CiphertextEnvelope;
    sessionId?: string;
  }): RelayedEnvelope {
    const envelope: RelayedEnvelope = {
      id: `env-${Date.now()}-${++this.counter}`,
      senderId: input.senderId,
      recipientId: input.recipientId,
      payload: input.payload,
      sessionId: input.sessionId,
      relayedAt: Date.now(),
    };
    const inbox = this.inboxes.get(input.recipientId) ?? [];
    inbox.push(envelope);
    this.inboxes.set(input.recipientId, inbox);
    return envelope;
  }

  drainInbox(recipientId: string, options?: DrainInboxOptions): RelayedEnvelope[] {
    const inbox = this.inboxes.get(recipientId) ?? [];
    if (inbox.length === 0) return [];

    const limit = options?.limit;
    if (limit !== undefined && limit < inbox.length) {
      const taken = inbox.slice(0, limit);
      this.inboxes.set(recipientId, inbox.slice(limit));
      return taken;
    }

    this.inboxes.delete(recipientId);
    return inbox;
  }

  shutdown(): void {
    this.bundles.clear();
    this.inboxes.clear();
  }
}
