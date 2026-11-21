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
  /**
   * Every other query parameter the user arrived with, preserved verbatim.
   *
   * The Next /oauth/authorize route forwards ALL RP parameters to /sso, so
   * an RP may arrive with response_mode, prompt, login_hint, ui_locales,
   * max_age, acr_values, display, or future OIDC parameters. The old builder
   * only carried the seven named fields and silently dropped the rest — a
   * prompt=login or response_mode=form_post RP would have its request
   * rewritten on the way to the backend. Extras are forwarded as-is; the
   * backend ignores parameters it does not implement, but nothing the RP
   * sent is dropped at the /sso layer.
   */
  extras: Record<string, string>;
}

/**
 * Query keys consumed by the named fields above (or by the /sso handoff
 * itself) and therefore never copied into `extras`: `returnTo` is the
 * /oauth/authorize mapping of redirect_uri, and `__quant_sso_ticket` is an
 * ecosystem handoff credential that must never be forwarded to the backend.
 */
const KNOWN_OIDC_QUERY_KEYS = new Set([
  'response_type',
  'client_id',
  'redirect_uri',
  'returnTo',
  'scope',
  'state',
  'code_challenge',
  'code_challenge_method',
  'nonce',
  '__quant_sso_ticket',
]);

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
  const extras: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    if (!KNOWN_OIDC_QUERY_KEYS.has(key)) extras[key] = value;
  });
  return {
    clientId,
    redirectUri,
    scope: searchParams.get('scope') ?? '',
    state: searchParams.get('state') ?? '',
    codeChallenge: searchParams.get('code_challenge') ?? '',
    codeChallengeMethod: searchParams.get('code_challenge_method') ?? '',
    nonce: searchParams.get('nonce') ?? '',
    extras,
  };
}

/**
 * True when the visit carries an OIDC-looking request that FAILED strict
 * detection — e.g. response_type=code with client_id but no redirect_uri,
 * or an unsupported response_type. Such a visit is a broken sign-in link,
 * not an ecosystem visit (ecosystem visits never carry response_type), so
 * the chooser must show an honest error instead of silently falling through
 * to the ticket handoff, which would bounce and drop the OIDC parameters.
 * False for plain ecosystem visits and for genuine OIDC requests.
 */
export function isPartialOidcAuthorizeRequest(
  searchParams: URLSearchParams,
): boolean {
  return (
    searchParams.has('response_type') &&
    parseOidcAuthorizeRequest(searchParams) === null
  );
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
  for (const [key, value] of Object.entries(req.extras ?? {})) {
    params.set(key, value);
  }
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
      // Defense in depth on top of the backend's registered-URI validation
      // (backend/routes/oauth.ts resolveRedirectUri: every authorize 302
      // targets the DB-registered URI verbatim): the browser must only ever
      // navigate to the redirect_uri this request asked for, with the
      // backend's ?code=/ ?error= suffix. A redirect anywhere else — a
      // misbehaving proxy, a backend regression, a confused response — is
      // an honest error, never a top-level navigation to an attacker URI.
      if (!data.redirect.startsWith(req.redirectUri)) {
        return {
          kind: 'error',
          status: res.status,
          message:
            'The sign-in response did not point back to the app that asked for sign-in. Nothing was sent anywhere.',
        };
      }
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
