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
 * Strip a stray trailing pipe (e.g. "QA Engineer|") that can leak into a saved
 * signature from the editor. Preserves any closing HTML tags.
 */
function stripTrailingPipe(html: string): string {
  return html.replace(/\|\s*((?:<\/[^>]+>\s*)*)$/, '$1').trim();
}

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
      const raw = response.data.contentHtml?.trim() ?? '';
      return stripTrailingPipe(raw);
    })
    .catch(() => '');

  return cached;
}

/** Drop the cache so the next composer picks up an edited signature. */
export function invalidateDefaultSignature(): void {
  cached = null;
  cachedOptions = null;
}

// ============================================================================
// Multiple signatures (fix/qm-multiple-signatures)
//
// The backend has always carried a full signature list with an `isDefault`
// flag (EmailSignatureService: at most one default, first signature becomes
// the default, deleting the default promotes the next one by name). The
// frontend never read the list: Settings edited only the default row, and the
// composer loaded only the default's HTML — so a formal and a casual
// signature could not coexist, let alone be picked per message.
//
// This is the list reader the composer picker and the Settings manager share.
// Same never-rejects contract as `loadDefaultSignatureHtml`: a list that
// cannot be loaded must not block a send, and the composer falls back to the
// default-only path when the list comes back empty.
// ============================================================================

export interface EmailSignatureOption {
  id: string;
  name: string;
  contentHtml: string;
  isDefault: boolean;
}

let cachedOptions: Promise<EmailSignatureOption[]> | null = null;

/**
 * Every signature on the account, default first (the backend orders the list
 * that way), each entry's HTML pipe-stripped like the default path.
 *
 * Never rejects: failure yields [] and the caller falls back to the
 * default-only path, exactly as a single-signature account behaves.
 */
export function loadEmailSignatures(): Promise<EmailSignatureOption[]> {
  if (typeof window === 'undefined') return Promise.resolve([]);
  if (cachedOptions) return cachedOptions;

  cachedOptions = apiClient
    .getEmailSignatures()
    .then((response) => {
      if (!response.success || !Array.isArray(response.data)) return [];
      return response.data.map((signature) => ({
        id: signature.id,
        name: signature.name,
        contentHtml: stripTrailingPipe(signature.contentHtml?.trim() ?? ''),
        isDefault: signature.isDefault === true,
      }));
    })
    .catch(() => []);

  return cachedOptions;
}

/** Drop both caches (default + list) so the next composer picks up edits. */
export function invalidateSignatures(): void {
  cached = null;
  cachedOptions = null;
}

/**
 * The signature a fresh composer starts with: the flagged default, else the
 * first in list order (the backend guarantees a default exists whenever any
 * signature exists, so the fallback is belt-and-braces), else null.
 */
export function pickDefaultSignature(
  signatures: EmailSignatureOption[],
): EmailSignatureOption | null {
  if (signatures.length === 0) return null;
  return signatures.find((signature) => signature.isDefault) ?? signatures[0] ?? null;
}
