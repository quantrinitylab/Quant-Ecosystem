import { NextRequest, NextResponse } from 'next/server';
import {
  APP_ACCESS_COOKIE,
  APP_REFRESH_COOKIE,
  QUANTMAIL_REFRESH_COOKIE,
  QUANTAI_OAUTH_CLIENT_ID,
  SSO_RETURN_COOKIE,
  SSO_STATE_COOKIE,
  SSO_VERIFIER_COOKIE,
  SsoError,
  exchangeCodeForTokens,
  fetchUserinfo,
  safeReturnPath,
  timingSafeEqualStrings,
} from '../../../../../lib/sso-oauth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BACKEND_URL =
  process.env.QUANTAI_BACKEND_URL ??
  process.env.NEXT_PUBLIC_QUANTAI_BACKEND_URL ??
  'http://localhost:3004';

/** Maps internal SSO failures to honest, non-technical login-page copy. */
function errorRedirect(origin: string, code: string): NextResponse {
  const url = new URL('/login', origin);
  url.searchParams.set('auth_error', code);
  return NextResponse.redirect(url, { headers: { 'cache-control': 'no-store' } });
}

function clearSsoCookies(response: NextResponse): void {
  for (const name of [SSO_STATE_COOKIE, SSO_VERIFIER_COOKIE, SSO_RETURN_COOKIE]) {
    response.cookies.set(name, '', { path: '/', maxAge: 0 });
  }
}

function sessionCookieOpts(request: NextRequest, maxAge: number) {
  return {
    httpOnly: true,
    secure: request.url.startsWith('https://') || process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

/**
 * GET /api/auth/sso/callback — completes the OAuth2 code+PKCE handshake
 * (Contract A) and the /sso chooser ticket handoff (Contract B).
 *
 * Contract A (?code=&state=): validates the state cookie (CSRF), exchanges the
 * code for tokens back-channel, verifies the identity via userinfo
 * back-channel, then establishes the QuantAI session in HttpOnly cookies and
 * redirects to the app home. No token ever appears in the URL.
 *
 * Contract B (?sso_ticket=): verifies the single-use ticket with QuantMail and
 * mints a QuantAI session via the backend /auth/sso/exchange endpoint.
 *
 * Root cause of the old "SSO bounces back to /login" bug: the login page
 * ingested handoff tokens client-side into localStorage, but nothing ever
 * established a server session (no code exchange existed at all, the chooser
 * param changed to sso_ticket which the page never read, and the transparent
 * ticket exchange pointed at a backend endpoint that did not exist). Every
 * path here ends in a real, server-verified session before redirecting.
 */
export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const params = request.nextUrl.searchParams;

  // Provider-side error (user denied consent, etc.).
  const providerError = params.get('error');
  if (providerError) {
    return errorRedirect(origin, 'provider_denied');
  }

  // Contract B: single-use chooser ticket. Verify with QuantMail, then mint a
  // QuantAI session through the backend exchange (same as the ticket route).
  const ticket = params.get('sso_ticket');
  if (ticket) {
    return handleSsoTicket(request, origin, ticket);
  }

  // Contract A: authorization code.
  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) {
    return errorRedirect(origin, 'missing_code');
  }

  const stateCookie = request.cookies.get(SSO_STATE_COOKIE)?.value ?? '';
  const verifierCookie = request.cookies.get(SSO_VERIFIER_COOKIE)?.value ?? '';
  const returnCookie = request.cookies.get(SSO_RETURN_COOKIE)?.value ?? null;

  // Fail closed on CSRF: state must match the cookie set by /sso/start.
  if (!stateCookie || !verifierCookie || !timingSafeEqualStrings(state, stateCookie)) {
    const redirect = errorRedirect(origin, 'invalid_state');
    clearSsoCookies(redirect);
    return redirect;
  }

  const redirectUri = `${origin}/api/auth/sso/callback`;
  const destination = safeReturnPath(returnCookie) ?? '/';

  try {
    const tokens = await exchangeCodeForTokens({
      code,
      redirectUri,
      clientId: QUANTAI_OAUTH_CLIENT_ID,
      codeVerifier: verifierCookie,
    });
    // Back-channel identity verification — the code alone is not trusted.
    await fetchUserinfo({ accessToken: tokens.accessToken });

    const response = NextResponse.redirect(new URL(destination, origin), {
      headers: { 'cache-control': 'no-store' },
    });
    clearSsoCookies(response);
    // QuantMail-issued tokens are accepted by the QuantAI backend (issuer
    // 'quantmail' is in the shared requireAuth accept-list), so they double as
    // the QuantAI app session — same cookie the password login sets.
    response.cookies.set(
      APP_ACCESS_COOKIE,
      tokens.accessToken,
      sessionCookieOpts(request, Math.min(tokens.expiresIn, 3600)),
    );
    if (tokens.refreshToken) {
      // Keep the existing /auth/refresh machinery working: it forwards this
      // cookie to the identity root, which rotates it.
      response.cookies.set(
        QUANTMAIL_REFRESH_COOKIE,
        tokens.refreshToken,
        sessionCookieOpts(request, 30 * 24 * 60 * 60),
      );
    }
    return response;
  } catch (err) {
    const code = err instanceof SsoError ? err.code : 'callback_failed';
    const redirect = errorRedirect(origin, code);
    clearSsoCookies(redirect);
    return redirect;
  }
}

/** Contract-B ticket handling shared with POST /api/auth/sso/ticket. */
export async function verifyTicketAndMintSession(
  ticket: string,
): Promise<{ accessToken: string; refreshToken: string; user: unknown } | null> {
  if (!ticket || ticket.length < 8 || ticket.length > 4096) return null;
  try {
    const res = await fetch(new URL('/auth/sso/exchange', BACKEND_URL).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ssoTicket: ticket }),
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => null)) as {
      success?: boolean;
      data?: { accessToken?: string; refreshToken?: string; user?: unknown };
    } | null;
    if (!res.ok || !data?.success || typeof data.data?.accessToken !== 'string') return null;
    return {
      accessToken: data.data.accessToken,
      refreshToken:
        typeof data.data.refreshToken === 'string' ? data.data.refreshToken : data.data.accessToken,
      user: data.data.user ?? null,
    };
  } catch {
    return null;
  }
}

async function handleSsoTicket(
  request: NextRequest,
  origin: string,
  ticket: string,
): Promise<NextResponse> {
  const returnCookie = request.cookies.get(SSO_RETURN_COOKIE)?.value ?? null;
  const destination = safeReturnPath(returnCookie) ?? '/';
  const session = await verifyTicketAndMintSession(ticket);
  if (!session) {
    const redirect = errorRedirect(origin, 'invalid_ticket');
    clearSsoCookies(redirect);
    return redirect;
  }
  const response = NextResponse.redirect(new URL(destination, origin), {
    headers: { 'cache-control': 'no-store' },
  });
  clearSsoCookies(response);
  response.cookies.set(APP_ACCESS_COOKIE, session.accessToken, sessionCookieOpts(request, 3600));
  response.cookies.set(
    APP_REFRESH_COOKIE,
    session.refreshToken,
    sessionCookieOpts(request, 30 * 24 * 60 * 60),
  );
  return response;
}
