// ============================================================================
// quantchat — encryption (E2EE) feature barrel (Layer 5)
// ============================================================================
//
// The single import point for UI surfaces doing end-to-end encryption. The
// data-path hooks (`useEncryption`) carry only ciphertext + public bundles over
// the `/api/e2ee/*` proxy (Requirement 1.4, inline-fetch free), while the
// client-side engine wrapper (`e2eeClient`) keeps all key material and plaintext
// in the browser (Requirement 7.5). UI components import from
// `@/features/encryption`.
export * from './types';
export * from './useEncryption';
export * from './e2eeClient';
// W5 — client-built blind-index search: tokenize + HMAC on send, query by hash.
// The Search_Key and plaintext stay client-side (`searchClient`); the hooks only
// carry opaque token hashes over the `/api/search*` proxy (`useSearch`).
export * from './searchClient';
export * from './useSearch';
