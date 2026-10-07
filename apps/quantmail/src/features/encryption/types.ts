// ============================================================================
// quantmail — encryption (E2EE) surface DTOs (Layer 5 request/response contracts)
// ============================================================================
//
// Frontend-facing data shapes for the encryption api-client hooks. SECURITY
// CONTRACT (Req 7.5): every shape here is CIPHERTEXT or PUBLIC key-distribution
// material — there is intentionally **no** `privateKey`, `plaintext`, or
// ratchet-secret field, because those never cross the seam. Key generation,
// encryption, and decryption happen client-side via the `@quant/encryption`
// engine (see `e2eeClient.ts`); these DTOs describe only what is safe to send to
// / receive from the zero-knowledge backend relay.

/** PUBLIC pre-key bundle published for key distribution (no private key). */
export interface PublicPreKeyBundle {
  identityKey: string;
  signedPreKey: string;
  signedPreKeySignature: string;
  oneTimePreKey?: string;
  registrationId: number;
}

/** Body for POST /api/e2ee/keys — publish my device's PUBLIC bundle. */
export interface PublishKeyBundleInput {
  deviceId: string;
  bundle: PublicPreKeyBundle;
}

export interface PublishedKeyBundle {
  userId: string;
  deviceId: string;
  bundle: PublicPreKeyBundle;
  publishedAt: number;
}

export interface PublishKeyBundleResponse {
  bundle: PublishedKeyBundle;
}

export interface PeerKeyBundlesResponse {
  userId: string;
  bundles: PublishedKeyBundle[];
}

/** Opaque CIPHERTEXT envelope — the backend can neither read nor decrypt this. */
export interface CiphertextEnvelope {
  ciphertext: string;
  nonce: string;
  tag: string;
  algorithm: 'aes-256-gcm' | 'chacha20-poly1305' | 'xchacha20-poly1305';
  senderFingerprint: string;
  recipientFingerprint: string;
  timestamp: string;
  version: number;
}

/** Body for POST /api/e2ee/messages — relay a ciphertext envelope to a peer. */
export interface RelayMessageInput {
  recipientId: string;
  sessionId?: string;
  payload: CiphertextEnvelope;
}

export interface RelayedEnvelope {
  id: string;
  senderId: string;
  recipientId: string;
  payload: CiphertextEnvelope;
  sessionId?: string;
  relayedAt: number;
}

export interface RelayMessageResponse {
  envelope: RelayedEnvelope;
}

export interface InboxResponse {
  envelopes: RelayedEnvelope[];
  count: number;
}
