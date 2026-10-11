/**
 * Query params used by the QuantMail → app SSO handoff. Every one is scrubbed
 * from the URL via history.replaceState immediately after the handoff is
 * consumed, so neither tokens nor PII linger in the address bar, browser
 * history, or server logs.
 *
 * - `token` / `accessToken` / `access_token` / `__quant_sso_ticket`: legacy SSO
 *   token aliases (kept for cross-app backward compatibility).
 * - `sso_ticket`: the Contract-B single-use chooser ticket (NOT a token).
 *   Verified server-side via POST /api/auth/sso/ticket, then scrubbed.
 * - `code` / `state`: the OAuth2 authorization response (Contract A). Consumed
 *   by the server-side /api/auth/sso/callback; scrubbed defensively if they
 *   ever land on the login page.
 * - `refreshToken`: legacy misnomer — it carried the access token, not a
 *   refresh token.
 * - `__quant_return`: consumed as the post-login return path before scrubbing.
 */
export const SSO_HANDOFF_URL_PARAMS = [
  '__quant_sso_ticket',
  'sso_ticket',
  'code',
  'state',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  '__quant_return',
] as const;

/** Removes every SSO handoff param from the given URL. Returns the URL. */
export function scrubSsoHandoffParams(url: URL): URL {
  for (const param of SSO_HANDOFF_URL_PARAMS) {
    url.searchParams.delete(param);
  }
  return url;
}
