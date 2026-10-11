// Login-page external SSO handoff — extracted for unit testing.
//
// SECURITY: the raw session access token must NEVER travel in a redirect URL
// query string (browser history, server access logs, Referer headers). This
// module mints a short-lived single-use opaque ticket via
// POST /api/sso/ticket/mint (the bearer token goes in the Authorization
// header of that POST only) and builds a redirect URL carrying ONLY
// `?__quant_sso_ticket=<ticket>`.
//
// The receiving app's backend resolves the ticket to an identity server-side
// and then establishes its own session. On mint failure we surface an honest
// error — there is deliberately no fallback that puts the token back in the
// URL.

import { buildSsoHandoffUrl, mintSsoTicket } from '../sso/sso-ticket-handoff';

/**
 * Perform the external-destination SSO handoff after a successful sign-in.
 *
 * @param dest the external destination URL (http(s) only; callers validate).
 * @param accessToken the current session access token, or null.
 * @param setLocation callback that actually performs the redirect (injected
 *   so tests can capture the URL instead of navigating).
 * @param setError reports an honest failure message to the user.
 */
export async function handoffToExternalDestination(
  dest: string,
  accessToken: string | null,
  setLocation: (url: string) => void,
  setError: (message: string | null) => void,
): Promise<void> {
  if (!accessToken) {
    setError('No active session token available. Please sign in again.');
    return;
  }
  try {
    const ticket = await mintSsoTicket(accessToken, { returnTo: dest });
    setLocation(buildSsoHandoffUrl(dest, ticket));
  } catch {
    setError(
      'Could not create a secure sign-in ticket. Your session is still active here — please try again.',
    );
  }
}
