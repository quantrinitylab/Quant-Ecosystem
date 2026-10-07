// ============================================================================
// quantmail — the stored "How much thinking" preference, read once per request
// ============================================================================
//
// The settings picker writes one key. Before this file existed, three separate
// places hand-wrote the string `'quant-ai-model-mode'` and all three of them were
// inside the settings page — which is how the preference came to have no readers
// at all while the page promised it was "sent with each request as an intent".
//
// Every AI request path now reads it through here, and the key itself lives in
// `@quant/common` beside the tier table, so the writer and the readers cannot
// drift apart. Returns `'auto'` on the server, in a private-mode browser that
// throws on `localStorage`, and for any value this build does not recognise.
// ============================================================================

import {
  AI_INTENT_STORAGE_KEY,
  normalizeStoredIntent,
  resolveAIIntent,
  type AIIntent,
} from '@quant/common';

export function readAIIntent(): AIIntent {
  if (typeof window === 'undefined') return 'auto';
  try {
    return normalizeStoredIntent(window.localStorage.getItem(AI_INTENT_STORAGE_KEY));
  } catch {
    // Safari in private mode throws on access, not on write. An unreadable
    // preference is the same as an unset one.
    return 'auto';
  }
}

export function writeAIIntent(intent: AIIntent): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AI_INTENT_STORAGE_KEY, intent);
  } catch {
    /* A preference we cannot persist still applies to this session's requests. */
  }
}

/**
 * How long the browser should wait for a given intent. `auto` is resolved on the
 * server against the real request, so the client cannot know the tier in advance
 * — it budgets for the slowest tier `auto` could pick rather than aborting a
 * legitimately slow answer and reporting it as a network failure.
 */
export function clientTimeoutForIntent(intent: AIIntent): number {
  return resolveAIIntent(intent === 'auto' ? 'deep' : intent).clientTimeoutMs;
}
