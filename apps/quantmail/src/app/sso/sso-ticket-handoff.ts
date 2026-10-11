// ============================================================================
// SSO ticket handoff — pure helpers (unit-tested under node, no DOM needed)
// ============================================================================
//
// SECURITY: the session access token must NEVER travel in a redirect URL
// query string (browser history, server access logs, Referer headers).
//
// The handoff works in two steps:
//   1. `mintSsoTicket` — POSTs the bearer token in the Authorization header to
//      /api/sso/ticket/mint and gets back a short-lived single-use opaque
//      ticket. The token appears in a request header only, never in a URL.
//   2. `buildSsoHandoffUrl` — builds the cross-app redirect URL carrying ONLY
//      `?__quant_sso_ticket=<ticket>`. Any legacy credential params that happen
//      to already be on the URL are stripped defensively.
//
// The receiving app's backend resolves the ticket to an identity server-side
// (POST /api/sso/ticket/resolve with its OAuth client credentials) and then
// establishes its own session.

/** The only credential param that may travel in the cross-app redirect URL. */
export const SSO_TICKET_PARAM = '__quant_sso_ticket';

/**
 * Legacy params that used to carry the raw bearer token. They are never set
 * anymore; `buildSsoHandoffUrl` strips them if they arrive on the URL anyway.
 */
const LEGACY_CREDENTIAL_PARAMS = [
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
] as const;

export interface MintSsoTicketOptions {
  clientId?: string | null;
  returnTo?: string;
}

/**
 * Mint a single-use opaque SSO ticket for the current session.
 *
 * The bearer token travels ONLY in the Authorization header of this POST —
 * never in a URL — so it cannot land in browser history, server access logs,
 * or Referer headers.
 *
 * @throws when the mint endpoint rejects the request or returns no ticket.
 */
export async function mintSsoTicket(
  accessToken: string,
  options: MintSsoTicketOptions = {},
): Promise<string> {
  const res = await fetch('/api/sso/ticket/mint', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      ...(options.clientId ? { clientId: options.clientId } : {}),
      ...(options.returnTo ? { returnTo: options.returnTo } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`SSO ticket mint failed (HTTP ${res.status})`);
  }
  const data = (await res.json()) as { ticket?: unknown };
  if (!data || typeof data.ticket !== 'string' || !data.ticket) {
    throw new Error('SSO ticket mint returned no ticket');
  }
  return data.ticket;
}

/**
 * Build the cross-app redirect URL. ONLY the opaque ticket travels in the
 * query string; any legacy credential params already present are stripped.
 */
export function buildSsoHandoffUrl(returnTo: string, ticket: string): string {
  const targetUrl = new URL(returnTo);
  for (const param of LEGACY_CREDENTIAL_PARAMS) {
    targetUrl.searchParams.delete(param);
  }
  targetUrl.searchParams.set(SSO_TICKET_PARAM, ticket);
  return targetUrl.toString();
}
