// ============================================================================
// quantmail — the saved default signature, fetched once per session
// ============================================================================
//
// `getDefaultEmailSignature()` had exactly one caller: the settings page that
// writes it. So the row's own description — "Appended to messages you send" —
// was false for as long as it had been on screen. The signature was persisted
// correctly, served correctly, and read by nothing.
//
// This module is the missing reader. It is deliberately a module-level cache
// rather than a React Query hook: the composer needs the signature inside
// `buildFinalMessage()`, which is called from the send and draft handlers rather
// than during render, and a promise cached here is also what makes the second
// composer open instant instead of re-fetching.
//
// `invalidateDefaultSignature()` is called by the settings page after a save, so
// editing the signature and immediately composing does not send the old one.
// ============================================================================

import { apiClient } from '../services/api-client';

let cached: Promise<string> | null = null;

/**
 * The default signature's HTML, or '' when the account has none.
 *
 * Never rejects. A signature that cannot be loaded must not be able to block a
 * send — the message goes without it, which is what happens today anyway.
 */
export function loadDefaultSignatureHtml(): Promise<string> {
  if (typeof window === 'undefined') return Promise.resolve('');
  if (cached) return cached;

  cached = apiClient
    .getDefaultEmailSignature()
    .then((response) => {
      if (!response.success || !response.data) return '';
      return response.data.contentHtml?.trim() ?? '';
    })
    .catch(() => '');

  return cached;
}

/** Drop the cache so the next composer picks up an edited signature. */
export function invalidateDefaultSignature(): void {
  cached = null;
}
