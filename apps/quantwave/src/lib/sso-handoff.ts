// ============================================================================
// QuantWave — SSO handoff consumer helpers (Contract B).
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
// ============================================================================

export { scrubSsoParamsFromUrl, SSO_HANDOFF_PARAM_NAMES } from '@quant/shared-ui';

/** The Contract B ticket param QuantMail's /sso chooser appends. */
export const SSO_TICKET_PARAM = 'sso_ticket';

/**
 * Read the Contract B ticket from the current query string. Returns the
 * trimmed ticket, or null when no handoff is present.
 */
export function readSsoTicketFromSearch(
  searchParams: URLSearchParams | null | undefined,
): string | null {
  if (!searchParams) return null;
  const value = searchParams.get(SSO_TICKET_PARAM);
  return value && value.trim() ? value.trim() : null;
}
