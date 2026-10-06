// ============================================================================
// QuantCooks — SSO handoff helpers (consumer side).
//
// QuantMail's SSO account chooser returns the user to QuantCooks with a
// QuantMail-issued JWT in the URL (?token=...&accessToken=...&__quant_sso_ticket=...,
// plus userId/email/displayName). This module is the consumer half of that
// handoff: read the token out of the URL, and scrub the URL afterwards so the
// token never lingers in the address bar.
//
// Pure functions — no DOM/React — so they are unit-testable.
// ============================================================================

/** URL params the QuantMail SSO chooser may carry the handoff token in. */
export const SSO_TOKEN_PARAM_NAMES = [
  'token',
  'accessToken',
  'access_token',
  '__quant_sso_ticket',
] as const;

/** Extra handoff params worth scrubbing (identity hints, not secrets). */
const SSO_PII_PARAM_NAMES = ['__quant_return', 'userId', 'email', 'displayName'] as const;

/**
 * Extract the first non-empty SSO token from a query string. `search` may be
 * `window.location.search` (leading `?`) or a bare `a=1&token=...` string.
 * Returns null when no handoff token is present.
 */
export function readSsoTokenFromSearch(search: string): string | null {
  try {
    const query = search.startsWith('?') ? search.slice(1) : search;
    const params = new URLSearchParams(query);
    for (const name of SSO_TOKEN_PARAM_NAMES) {
      const value = params.get(name);
      if (value !== null && value.trim().length > 0) {
        return value.trim();
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Strip every SSO handoff param (tokens AND the userId/email/displayName hints
 * the chooser appends) from a full URL, preserving everything else — including
 * `returnTo` and the hash. Safe to call when no handoff params exist.
 */
export function scrubSsoParamsFromUrl(href: string): string {
  try {
    const url = new URL(href);
    for (const name of SSO_TOKEN_PARAM_NAMES) url.searchParams.delete(name);
    for (const name of SSO_PII_PARAM_NAMES) url.searchParams.delete(name);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}
