// ============================================================================
// Browser OIDC handoff for /sso (fix/qm-oauth-authorize-302).
//
// Problem: discovery advertises an authorization_endpoint (/oauth/authorize,
// and the public discovery advertises /sso), but a browser user who lands on
// /sso with OIDC authorize parameters (response_type=code, client_id,
// redirect_uri, state, code_challenge, ...) was pushed through the ecosystem
// ticket-handoff instead: the chooser minted an SSO ticket and bounced to
// `redirect_uri?__quant_sso_ticket=<ticket>`, silently dropping every OIDC
// parameter. The relying party never received an authorization code and the
// user never saw the backend consent screen — a pure-browser OIDC flow could
// never complete.
//
// Fix: /sso now detects an OIDC authorize request (strict: response_type=code
// + client_id + redirect_uri) and, once the user is authenticated, completes
// it against the Next /api/oauth/authorize proxy with the user's real bearer
// <redacted> (Authorization header only — the token never travels in a URL):
//   - backend 302 (consent already granted) -> the proxy answers this
//     opt-in caller with 200 JSON { redirect } (see OIDC_BROWSER_HEADER);
//     the browser navigates top-level to redirect_uri?code=...&state=...
//   - backend 200 HTML (consent screen) -> the HTML is rendered as this page;
//     its form posts to /api/oauth/consent with the single-use consent_token
//     and the browser follows the resulting 302 top-level to the RP.
// Non-OIDC visits to /sso keep the exact ticket-handoff behavior they had.
//
// Security notes:
//   - redirect_uri is passed through VERBATIM (never safeReturnPath-filtered);
//     the backend's resolveRedirectUri matches it exactly against the
//     client's registered redirect_uris, so the final navigation target is
//     RP-controlled, never attacker-chosen.
//   - The consent HTML comes from our own backend (same trust as a direct
//     browser navigation there); the consent_token inside is single-use and
//     request-bound (services/oauth-consent-session.ts).
// ============================================================================

export interface OidcAuthorizeRequest {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  nonce: string;
}

/**
 * Header the /sso chooser sends on its /api/oauth/authorize fetch.
 *
 * A browser fetch cannot read a redirect's Location (it surfaces as an
 * opaqueredirect) and must NOT follow the authorize 302 in the background —
 * the authorization code has to reach the top-level navigation. Opt-in
 * callers get the backend's 302 target as 200 JSON { redirect } so the
 * browser can navigate itself. Programmatic clients that do not send this
 * header keep the exact 302-passthrough behavior they had before.
 */
export const OIDC_BROWSER_HEADER = 'X-Quant-OIDC-Browser';

/**
 * Detect an OIDC authorization request in the /sso query string.
 *
 * Strict on purpose: response_type must be exactly 'code' (the only flow the
 * backend supports), client_id must be present, and redirect_uri must be
 * present either verbatim (RP followed discovery straight to /sso) or as
 * returnTo (the Next /oauth/authorize route maps redirect_uri -> returnTo
 * when it 302s here). Anything else is the ecosystem ticket-handoff path.
 */
export function parseOidcAuthorizeRequest(
  searchParams: URLSearchParams,
): OidcAuthorizeRequest | null {
  if (searchParams.get('response_type') !== 'code') return null;
  const clientId = (searchParams.get('client_id') ?? '').trim();
  const redirectUri = (
    searchParams.get('redirect_uri') ??
    searchParams.get('returnTo') ??
    ''
  ).trim();
  if (!clientId || !redirectUri) return null;
  return {
    clientId,
    redirectUri,
    scope: searchParams.get('scope') ?? '',
    state: searchParams.get('state') ?? '',
    codeChallenge: searchParams.get('code_challenge') ?? '',
    codeChallengeMethod: searchParams.get('code_challenge_method') ?? '',
    nonce: searchParams.get('nonce') ?? '',
  };
}

/** Build the Next proxy URL that carries the OIDC request to the backend. */
export function buildOidcAuthorizeProxyUrl(req: OidcAuthorizeRequest): string {
  const params = new URLSearchParams();
  params.set('response_type', 'code');
  params.set('client_id', req.clientId);
  params.set('redirect_uri', req.redirectUri);
  if (req.scope) params.set('scope', req.scope);
  if (req.state) params.set('state', req.state);
  if (req.codeChallenge) params.set('code_challenge', req.codeChallenge);
  if (req.codeChallengeMethod) params.set('code_challenge_method', req.codeChallengeMethod);
  if (req.nonce) params.set('nonce', req.nonce);
  return `/api/oauth/authorize?${params.toString()}`;
}

export type OidcAuthorizeOutcome =
  | { kind: 'redirect'; location: string }
  | { kind: 'consent'; html: string }
  | { kind: 'error'; status: number; message: string };

function honestErrorMessage(status: number, data: Record<string, unknown>): string {
  const error = typeof data.error === 'string' ? data.error : '';
  const description =
    typeof data.error_description === 'string' ? data.error_description : '';
  if (status === 401 || error === 'unauthorized' || error === 'invalid_token') {
    return 'Your session expired. Please sign in again.';
  }
  if (description) return description;
  if (error) return `The sign-in request was rejected (${error}).`;
  return `The sign-in request was rejected (HTTP ${status}). Please try again.`;
}

/**
 * Run the OIDC authorize step against the Next proxy with the user's access
 * token. Network failures reject (the caller shows an honest error); backend
 * rejections resolve as { kind: 'error' } with a human-readable message.
 */
export async function runOidcAuthorize(
  token: string,
  req: OidcAuthorizeRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<OidcAuthorizeOutcome> {
  const res = await fetchImpl(buildOidcAuthorizeProxyUrl(req), {
    headers: {
      Authorization: `Bearer ${token}`,
      [OIDC_BROWSER_HEADER]: '1',
    },
    cache: 'no-store',
  });
  const contentType = res.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const data = (await res.json()) as Record<string, unknown>;
    if (typeof data.redirect === 'string' && data.redirect) {
      return { kind: 'redirect', location: data.redirect };
    }
    return { kind: 'error', status: res.status, message: honestErrorMessage(res.status, data) };
  }

  if (res.ok) {
    // 200 HTML consent screen from the backend. Rendered as this page, its
    // form posts to /api/oauth/consent with the single-use consent_token and
    // the browser follows the consent 302 top-level to the RP's redirect_uri.
    return { kind: 'consent', html: await res.text() };
  }

  return {
    kind: 'error',
    status: res.status,
    message: `Sign-in failed (HTTP ${res.status}). Please try again.`,
  };
}
