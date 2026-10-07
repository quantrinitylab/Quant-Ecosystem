// ============================================================================
// quantchat — client-side blind-index search engine (Layer 5, key-handling edge)
// ============================================================================
//
// This module is the client half of the W5 encrypted-search design (design
// Component 5 / Algorithm 5). It is, like `e2eeClient.ts`, a key-handling edge:
// the per-user **Search_Key** lives here and is NEVER transmitted to the proxy
// or the backend (Requirement 14.2). Everything that crosses the seam is an
// opaque `HMAC(Search_Key, token)` value — a Token_Hash — so the zero-knowledge
// server learns only token equality, never plaintext or the key (Req 15.6,
// 16.1).
//
//   - Tokenize / normalize plaintext   -> here (pure, deterministic).
//   - Compute HMAC token hashes         -> here, using the client-held Search_Key.
//   - On send (E2EE message)            -> hash each DISTINCT token and upload
//                                          ONLY the token hashes for the message
//                                          to the blind-index endpoint (Req 14.1).
//   - On search                         -> hash the query tokens and send ONLY
//                                          the token hashes to the unified search
//                                          route's `tokenHashes` field (Req 15.1).
//
// The transports (see `useSearch.ts`) only ever receive the *outputs* of the
// functions below — message ids, conversation ids, and opaque token hashes — so
// no Search_Key, plaintext, or key material reaches the Next proxy or backend.

import { createHmac, randomBytes } from 'crypto';

// ----------------------------------------------------------------------------
// Tokenize / normalize (Req 14.1, 15.1)
// ----------------------------------------------------------------------------

/**
 * Normalize plaintext into a canonical form before tokenizing so that the same
 * word produces the same token hash regardless of case, surrounding
 * punctuation, or diacritics. Pure and deterministic so the indexing path and
 * the query path agree byte-for-byte (otherwise a sent token could never be
 * matched by a query token).
 *
 * - lowercased,
 * - Unicode NFKD-decomposed with combining marks stripped (café -> cafe),
 * - every run of non-alphanumeric characters collapsed to a single space,
 * - trimmed.
 */
export function normalizeText(text: string): string {
  return (
    text
      .normalize('NFKD')
      // Strip combining diacritical marks (U+0300–U+036F).
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      // Keep letters/digits (incl. non-ASCII letters), turn everything else into spaces.
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  );
}

/** Minimum token length kept in the index (single-character noise is dropped). */
export const MIN_TOKEN_LENGTH = 1;

/**
 * Tokenize plaintext into the DISTINCT set of searchable tokens (Req 14.1: a
 * Token_Hash is computed "for each distinct token"). Returns tokens in
 * first-seen order with duplicates removed so a message contributes one index
 * row per unique token, never one per occurrence.
 */
export function tokenize(text: string): string[] {
  const normalized = normalizeText(text);
  if (normalized.length === 0) {
    return [];
  }
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const token of normalized.split(/\s+/)) {
    if (token.length < MIN_TOKEN_LENGTH || seen.has(token)) {
      continue;
    }
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}

// ----------------------------------------------------------------------------
// HMAC token hashing (Req 14.1, 15.1, 15.6, 16.1)
// ----------------------------------------------------------------------------

/**
 * Compute `HMAC(Search_Key, token)` for a single normalized token, returned as
 * a lowercase hex digest. The Search_Key is used here, client-side, and is
 * never serialized to the seam (Req 14.2). SHA-256 gives a fixed-width opaque
 * value the server can equality-match without learning the underlying token.
 */
export function computeTokenHash(searchKey: string, token: string): string {
  return createHmac('sha256', searchKey).update(token, 'utf8').digest('hex');
}

/**
 * Tokenize + normalize `plaintext` and compute the Token_Hash for each DISTINCT
 * token (Req 14.1 / 15.1). The returned hashes are themselves de-duplicated so
 * the upload/query carries one opaque value per distinct token. Plaintext and
 * the Search_Key never leave the client — only the returned hashes do.
 */
export function computeTokenHashes(searchKey: string, plaintext: string): string[] {
  const tokens = tokenize(plaintext);
  const seen = new Set<string>();
  const hashes: string[] = [];
  for (const token of tokens) {
    const hash = computeTokenHash(searchKey, token);
    if (!seen.has(hash)) {
      seen.add(hash);
      hashes.push(hash);
    }
  }
  return hashes;
}

// ----------------------------------------------------------------------------
// Search_Key management — derive / store locally (Req 14.2)
// ----------------------------------------------------------------------------

/** localStorage key under which the per-device Search_Key is persisted. */
export const SEARCH_KEY_STORAGE_KEY = 'quantchat.e2ee.searchKey';

/** Byte length of a freshly generated Search_Key (256-bit HMAC key). */
export const SEARCH_KEY_BYTES = 32;

/**
 * Generate a fresh random Search_Key (hex-encoded 256-bit secret). The key is a
 * client-only secret used to HMAC search tokens; it is generated here and must
 * stay on the device (Req 14.2).
 */
export function generateSearchKey(): string {
  return randomBytes(SEARCH_KEY_BYTES).toString('hex');
}

/**
 * Minimal synchronous key-value store abstraction for the Search_Key. Injected
 * so the key-management policy is decoupled from `localStorage` and fully
 * unit-testable (mirrors the transport-injection pattern in `e2eeClient.ts`).
 */
export interface SearchKeyStore {
  get(): string | null;
  set(key: string): void;
}

/**
 * Default `SearchKeyStore` backed by `localStorage` when available (browser),
 * degrading to an in-memory store during SSR / tests so callers never crash on
 * a missing `window`. The Search_Key never leaves the device boundary either
 * way (Req 14.2).
 */
export function createLocalSearchKeyStore(): SearchKeyStore {
  const hasLocalStorage =
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as { localStorage?: Storage }).localStorage !== 'undefined';

  if (hasLocalStorage) {
    const storage = (globalThis as unknown as { localStorage: Storage }).localStorage;
    return {
      get: () => storage.getItem(SEARCH_KEY_STORAGE_KEY),
      set: (key: string) => storage.setItem(SEARCH_KEY_STORAGE_KEY, key),
    };
  }

  let inMemory: string | null = null;
  return {
    get: () => inMemory,
    set: (key: string) => {
      inMemory = key;
    },
  };
}

/**
 * Read the device's Search_Key, generating and persisting a fresh one on first
 * use. The key stays client-side for the life of the device (Req 14.2). Callers
 * use the returned key to hash tokens for both indexing and querying so the two
 * paths share the same key and therefore the same hashes.
 */
export function getOrCreateSearchKey(store: SearchKeyStore = createLocalSearchKeyStore()): string {
  const existing = store.get();
  if (existing && existing.length > 0) {
    return existing;
  }
  const fresh = generateSearchKey();
  store.set(fresh);
  return fresh;
}

// ----------------------------------------------------------------------------
// Transport seams (carry token hashes + ids only — never the Search_Key)
// ----------------------------------------------------------------------------

/** Token hashes for one message, ready to upload to the blind index (Req 14.1). */
export interface BlindIndexUpload {
  messageId: string;
  conversationId: string;
  /** HMAC(Search_Key, token) values for the message's DISTINCT tokens. */
  tokenHashes: string[];
}

/** A candidate message id returned by an encrypted search (design Algorithm 5). */
export interface EncryptedSearchCandidate {
  messageId: string;
  conversationId: string;
}

/**
 * Transport seam for blind-index upload + query. The default implementation
 * (see `useSearch.ts`) talks to the same-origin `/api/search*` proxy; it is
 * injected here so this module performs no inline network I/O and the search
 * policy stays fully testable. The transport only ever sees message ids,
 * conversation ids, and opaque token hashes — never the Search_Key or plaintext.
 */
export interface BlindIndexTransport {
  /** Upload the token hashes for a newly sent E2EE message (Req 14.1). */
  uploadIndex(upload: BlindIndexUpload): Promise<void>;
  /** Send query token hashes to the unified search route (Req 15.1). */
  search(tokenHashes: string[]): Promise<EncryptedSearchCandidate[]>;
}

// ----------------------------------------------------------------------------
// High-level send / search flows
// ----------------------------------------------------------------------------

/** Input describing a freshly sent E2EE message to be indexed for search. */
export interface IndexMessageInput {
  messageId: string;
  conversationId: string;
  /** The message plaintext — tokenized + hashed here; NEVER uploaded. */
  plaintext: string;
}

/**
 * Build and upload the blind-index entry for a newly sent E2EE message
 * (Requirement 14.1): tokenize/normalize the plaintext, compute the Token_Hash
 * for each DISTINCT token using the client-held Search_Key, and upload ONLY the
 * token hashes (plus the message + conversation ids). The plaintext and the
 * Search_Key never leave the client (Req 14.2, 16.1).
 *
 * A message that tokenizes to nothing (e.g. emoji-only) contributes no index
 * rows, so the upload is skipped entirely.
 *
 * @returns the token hashes that were uploaded (empty when skipped).
 */
export async function indexMessageTokens(
  searchKey: string,
  input: IndexMessageInput,
  transport: BlindIndexTransport,
): Promise<string[]> {
  const tokenHashes = computeTokenHashes(searchKey, input.plaintext);
  if (tokenHashes.length === 0) {
    return [];
  }
  await transport.uploadIndex({
    messageId: input.messageId,
    conversationId: input.conversationId,
    tokenHashes,
  });
  return tokenHashes;
}

/**
 * Run an encrypted search (client side of design Algorithm 5): compute the
 * Token_Hash values for the query plaintext and send ONLY those hashes to the
 * unified search route (Requirement 15.1). The server matches hashes and
 * returns owner-scoped candidate message ids; final ranking/snippeting happens
 * client-side after local decryption. An empty/whitespace query yields no
 * hashes and therefore no candidates without a network round trip.
 */
export async function searchEncryptedMessages(
  searchKey: string,
  queryPlaintext: string,
  transport: BlindIndexTransport,
): Promise<EncryptedSearchCandidate[]> {
  const tokenHashes = computeTokenHashes(searchKey, queryPlaintext);
  if (tokenHashes.length === 0) {
    return [];
  }
  return transport.search(tokenHashes);
}
