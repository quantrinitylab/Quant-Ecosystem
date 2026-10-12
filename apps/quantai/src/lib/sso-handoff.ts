// ============================================================================
// QuantAI — SSO handoff detection for the login gate.
//
// Root cause (F-205): the old check used `search.includes('token=')`, a raw
// substring match that false-positives on any query param whose *value* merely
// contains the literal text (e.g. `?ref=token%3Dx` or `?note=has-token=-inside`).
// On a false positive the guard skipped the /login redirect while
// `isAuthenticated` stayed false, stranding the visitor on a permanent
// "redirecting" screen with no way forward.
//
// The guard must agree with the actual ingest contract: packages/shared-ui
// `UniversalSSOTokenBridge.consumeHandoffTicket` reads these exact keys via
// `searchParams.get(...)` — and treats a present-but-empty value as absent
// (returns null when the value is falsy). So here we do the same:
//
//   - exact key match on the URLSearchParams-decoded key name,
//   - key must carry a non-empty value,
//   - anything else (including malformed query strings) => not a handoff,
//     so the guard always falls through to the /login redirect.
//
// URLSearchParams is supported by every browser we target (all evergreen
// browsers since ~2017); no polyfill is needed.
// ============================================================================

/**
 * Exact query keys `UniversalSSOTokenBridge.consumeHandoffTicket` reads.
 * KEEP IN SYNC with the bridge — if it reads a new key, add it here too,
 * or the guard will flash /login during a real handoff.
 */
export const SSO_HANDOFF_KEYS = [
  '__quant_sso_ticket',
  'token',
  'accessToken',
  'access_token',
] as const;

/**
 * Returns true only when `search` (window.location.search form) carries a
 * non-empty SSO handoff value under one of the exact keys the bridge reads.
 * Never throws; returns false for anything it cannot parse.
 */
export function isSsoHandoffUrl(search: string | null | undefined): boolean {
  if (!search) return false;
  try {
    const params = new URLSearchParams(search);
    for (const key of SSO_HANDOFF_KEYS) {
      const value = params.get(key);
      if (value && value.length > 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}
