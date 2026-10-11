// ============================================================================
// QuantCooks — SSO handoff helpers (Contract B, consumer side).
//
// QuantMail's /sso account chooser hands back a single-use ticket as
// `?sso_ticket=`. The ticket is NOT a token — the login page scrubs it from
// the URL immediately (history.replaceState) and POSTs it to the same-origin
// /api/auth/sso/ticket route, which verifies it back-channel with QuantMail
// before minting an app session.
//
// Legacy token params (?token= / ?accessToken= / ?access_token= /
// ?__quant_sso_ticket=) are still scrubbed defensively — tokens must never
// linger in the address bar — but they are never trusted or exchanged.
//
// Pure functions — no DOM/React — so they are unit-testable.
// ============================================================================

export { scrubSsoParamsFromUrl, SSO_HANDOFF_PARAM_NAMES } from '@quant/shared-ui';

/** The Contract B ticket param QuantMail's /sso chooser appends. */
export const SSO_TICKET_PARAM = 'sso_ticket';

/**
 * Extract the Contract B ticket from a query string. `search` may be
 * `window.location.search` (leading `?`) or a bare `a=1&sso_ticket=...` string.
 * Returns null when no handoff ticket is present.
 */
export function readSsoTicketFromSearch(search: string): string | null {
  try {
    const query = search.startsWith('?') ? search.slice(1) : search;
    const params = new URLSearchParams(query);
    const value = params.get(SSO_TICKET_PARAM);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}
