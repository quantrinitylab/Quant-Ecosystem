/**
 * QC-F-080 — one home for the auth-cookie `Secure` decision.
 *
 * Every writer (and the logout deleter) of the `quant_access_token` /
 * `token` / `quant_refresh_token` session cookies must agree on the flags,
 * or the browser will not match — and therefore not store/delete — the same
 * cookie. The old per-site expression `NODE_ENV === 'production'` left every
 * staging-set cookie without `Secure`: staging is a deployed HTTPS surface,
 * not local dev. The rule is the backend guard's rule (server-core
 * `requiresRealSecret`): local environments (`development`, `test`, where
 * http://localhost login must keep working) are the ONLY ones without
 * `Secure`; every deployed name gets it.
 */
export function authCookieSecure(): boolean {
  return process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test';
}
