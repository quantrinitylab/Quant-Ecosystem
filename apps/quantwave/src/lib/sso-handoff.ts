// ============================================================================
// QuantWave — SSO handoff consumer helpers.
// QuantMail's SSO chooser (apps/quantmail/src/app/sso/SsoChooserContent.tsx)
// redirects back to this app's /login with the session token attached under
// several query params for backward compatibility: `token`, `accessToken`,
// `__quant_sso_ticket` (plus `access_token` accepted defensively). These
// helpers read the token in that priority order and scrub every token param
// from the address bar — on success AND failure — so the session token is
// never left sitting in the URL.
// ============================================================================

export const SSO_TOKEN_PARAMS = [
  'token',
  'accessToken',
  'access_token',
  '__quant_sso_ticket',
] as const;

/**
 * Read the SSO handoff token from the current query string.
 * Priority: token -> accessToken -> access_token -> __quant_sso_ticket.
 * Returns the trimmed token, or null when no handoff is present.
 */
export function readSsoTokenFromSearch(
  searchParams: URLSearchParams | null | undefined,
): string | null {
  if (!searchParams) return null;
  for (const name of SSO_TOKEN_PARAMS) {
    const value = searchParams.get(name);
    if (value && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Remove every SSO token param from the current URL, preserving everything
 * else (including returnTo). Uses history.replaceState so no extra history
 * entry is created.
 */
export function scrubSsoParamsFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  let changed = false;
  for (const name of SSO_TOKEN_PARAMS) {
    if (url.searchParams.has(name)) {
      url.searchParams.delete(name);
      changed = true;
    }
  }
  if (changed) {
    window.history.replaceState(null, '', url.toString());
  }
}
