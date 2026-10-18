// ============================================================================
// "More apps" panel → sibling-app SSO handoff (QuantMail is the account home)
// ============================================================================
//
// A signed-in QuantMail user tapping QuantChat / QuantAI in the "More apps"
// panel gets a one-tap SSO handoff instead of landing logged-out:
//
//   1. Mint a short-lived single-use opaque ticket via
//      POST /api/sso/ticket/mint — the bearer token travels ONLY in the
//      Authorization header of that POST (browserAuthSession holds it in
//      module memory; see services/browser-auth-session.ts).
//   2. Navigate to the sibling app with ONLY `?__quant_sso_ticket=<ticket>`
//      in the URL (buildSsoHandoffUrl strips any legacy credential params).
//
// The receiving app resolves the ticket server-side and establishes its own
// session — same contract as the login-page external-destination handoff
// (app/login/sso-handoff.ts).
//
// SECURITY: the raw session access token NEVER goes into the redirect URL
// (browser history, server access logs, Referer headers). There is
// deliberately no fallback that puts the token back in the URL.
//
// HONEST FAILURE: if there is no local session token, the mint fails, or the
// mint hangs past MINT_TIMEOUT_MS, we navigate to the sibling app's plain URL
// — the user lands logged-out there and that app's own login offers "Continue
// with QuantMail". A hung backend surfaces as the plain-URL fallback, never an
// infinite spinner (PR #621 auth-check pattern). Never a fake "signed in"
// claim, never a blocked navigation.

import { buildSsoHandoffUrl, mintSsoTicket } from './sso-ticket-handoff';
import { browserAuthSession } from '../../../services/browser-auth-session';
import type { EcosystemApp } from '../../../components/ecosystem-apps';

/** Ceiling for the ticket mint: past this, fall back to the plain app URL. */
export const SSO_MINT_TIMEOUT_MS = 15_000;

/**
 * Mint with a hard timeout. The underlying fetch is left to settle on its own
 * if the timeout wins — an unused ticket simply expires server-side.
 */
function mintSsoTicketWithTimeout(accessToken: string, returnTo: string): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('SSO ticket mint timed out')), SSO_MINT_TIMEOUT_MS);
  });
  return Promise.race([mintSsoTicket(accessToken, { returnTo }), timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/**
 * One-tap SSO handoff to a sibling ecosystem app from the "More apps" panel.
 *
 * @param app the ecosystem app the user tapped.
 * @param navigate performs the actual cross-origin navigation (injected so
 *   tests can capture the URL instead of navigating).
 */
export async function handoffToEcosystemApp(
  app: EcosystemApp,
  navigate: (url: string) => void,
): Promise<void> {
  const accessToken = browserAuthSession.getAccessToken();
  if (!accessToken) {
    // Not signed in here — plain navigation; the sibling app's own login
    // page offers "Continue with QuantMail".
    navigate(app.url);
    return;
  }
  try {
    const ticket = await mintSsoTicketWithTimeout(accessToken, app.url);
    navigate(buildSsoHandoffUrl(app.url, ticket));
  } catch {
    // Mint failed or timed out: honest degradation to the plain URL
    // (logged-out landing), never a URL carrying the raw session token.
    navigate(app.url);
  }
}
