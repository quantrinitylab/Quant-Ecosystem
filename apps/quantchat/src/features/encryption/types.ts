// ============================================================================
// quantchat — encryption (E2EE) surface DTOs (Layer 5 request/response contracts)
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

/** Body for POST /api/e2ee/prekeys (top-up) — replenish my PUBLIC one-time
 * prekey pool. ONLY public one-time prekey material crosses the seam (Req 2.8,
 * 16.1); there is intentionally no private key / ratchet field. */
export interface ReplenishOneTimePreKeysInput {
  oneTimePreKeys: string[];
}

/** Response for GET /api/e2ee/prekeys/count — remaining unclaimed one-time
 * prekeys for the authenticated user (drives replenishment, Req 2.7, 2.8). */
export interface OneTimePreKeyCountResponse {
  userId: string;
  remaining: number;
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

// ============================================================================
// Blind-index encrypted search DTOs (W5, Requirements 14.1, 15.1, 15.6, 16.1)
// ============================================================================
//
// SECURITY CONTRACT: every shape here carries OPAQUE HMAC token hashes and
// message/conversation identifiers only. There is intentionally no `plaintext`,
// `searchKey`, or `content` field — token hashing happens client-side via
// `searchClient.ts` and the Search_Key never crosses the seam (Req 14.2, 16.1).

/** Body for POST /api/search/index — upload a message's blind-index token
 * hashes. The owner (Search_Key owner) is taken server-side from the
 * authenticated session, never the client body (Req 14.3). Token hashes only. */
export interface BlindIndexUploadInput {
  messageId: string;
  conversationId: string;
  /** HMAC(Search_Key, token) values for the message's DISTINCT tokens. */
  tokenHashes: string[];
}

export interface BlindIndexUploadResponse {
  message: string;
}

/** Body for POST /api/search — unified search. The blind-index path is driven
 * by `tokenHashes` (E2EE messages); a plaintext `q` drives the legacy ILIKE
 * path (non-E2EE messages, Req 15.7). The Search_Key is NEVER sent (Req 15.1). */
export interface UnifiedSearchInput {
  q?: string;
  tokenHashes?: string[];
  page?: number;
  pageSize?: number;
}

/** A single blind-index candidate match (owner-scoped, deduped — Req 15.2, 15.5).
 * Re-exported from `searchClient` (the canonical definition) for DTO ergonomics. */
export type { EncryptedSearchCandidate } from './searchClient';
import type { EncryptedSearchCandidate } from './searchClient';

/** Paginated blind-index result envelope returned by the search service. */
export interface EncryptedSearchPage {
  data: EncryptedSearchCandidate[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/** Response for POST /api/search — plaintext (ILIKE) and encrypted (blind-index)
 * result sets side by side; either may be null when its input was absent. */
export interface UnifiedSearchResponse {
  plaintext: unknown | null;
  encrypted: EncryptedSearchPage | null;
}
