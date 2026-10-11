import { NextRequest, NextResponse } from 'next/server';
import {
  QUANTCHAT_OAUTH_CLIENT_ID,
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
  process.env.QUANTCHAT_BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://localhost:3002';

/**
 * GET /api/auth/sso/callback — completes the OAuth2 code+PKCE handshake
 * (Contract A) and the /sso chooser ticket handoff (Contract B).
 *
 * Contract A (?code=&state=): validates the state cookie (CSRF), exchanges the
 * code for QuantMail tokens back-channel, verifies the identity via userinfo
 * back-channel, then exchanges the QuantMail access token for QuantChat-native
 * tokens via the backend /auth/sso/exchange (QuantMail JWTs are NOT valid for
 * QuantChat's backend — different secret/issuer/audience; storing the raw
 * QuantMail JWT was the old "bounce back to /login" bug). The chat-native
 * session is parked in HttpOnly cookies and the browser is redirected to the
 * login page with ?sso=ready, where it bootstraps the Bearer <redacted> for the
 * realtime socket via POST /api/auth/sso/bootstrap. No token ever appears in
 * the URL.
 *
 * Contract B (?sso_ticket=): verifies the single-use ticket and mints a
 * QuantChat session the same way.
 */
export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const params = request.nextUrl.searchParams;

  const providerError = params.get('error');
  if (providerError) {
    return errorRedirect(origin, 'provider_denied');
  }

  const ticket = params.get('sso_ticket');
  const code = params.get('code');
  const state = params.get('state');

  if (!ticket && (!code || !state)) {
    return errorRedirect(origin, 'missing_code');
  }

  const returnCookie = request.cookies.get(SSO_RETURN_COOKIE)?.value ?? null;
  const destination = safeReturnPath(returnCookie) ?? '/';

  try {
    let chatTokens: { accessToken: string; refreshToken: string };
    if (ticket) {
      chatTokens = await mintChatSession({ ssoTicket: ticket });
    } else {
      const stateCookie = request.cookies.get(SSO_STATE_COOKIE)?.value ?? '';
      const verifierCookie = request.cookies.get(SSO_VERIFIER_COOKIE)?.value ?? '';
      // Fail closed on CSRF: state must match the cookie set by /sso/start.
      if (!stateCookie || !verifierCookie || !timingSafeEqualStrings(state!, stateCookie)) {
        const redirect = errorRedirect(origin, 'invalid_state');
        clearSsoCookies(redirect);
        return redirect;
      }
      const redirectUri = `${origin}/api/auth/sso/callback`;
      const tokens = await exchangeCodeForTokens({
        code: code!,
        redirectUri,
        clientId: QUANTCHAT_OAUTH_CLIENT_ID,
        codeVerifier: verifierCookie,
      });
      // Back-channel identity verification — the code alone is not trusted.
      await fetchUserinfo({ accessToken: tokens.accessToken });
      chatTokens = await mintChatSession({ ssoToken: tokens.accessToken });
    }

    const secure = request.url.startsWith('https://') || process.env.NODE_ENV === 'production';
    const response = NextResponse.redirect(
      loginReadyUrl(origin, destination),
      { headers: { 'cache-control': 'no-store' } },
    );
    clearSsoCookies(response);
    response.cookies.set('quant_access_token', chatTokens.accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 3600,
    });
    response.cookies.set('quant_refresh_token', chatTokens.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });
    return response;
  } catch (err) {
    const code = err instanceof SsoError ? err.code : 'callback_failed';
    const redirect = errorRedirect(origin, code);
    clearSsoCookies(redirect);
    return redirect;
  }
}

/** Exchanges a verified QuantMail credential for QuantChat-native tokens. */
async function mintChatSession(body: { ssoToken?: string; ssoTicket?: string }) {
  const res = await fetch(new URL('/auth/sso/exchange', BACKEND_URL).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: { accessToken?: string; refreshToken?: string };
  } | null;
  if (!res.ok || !data?.success || typeof data.data?.accessToken !== 'string') {
    throw new SsoError('SESSION_MINT_FAILED', 'Could not establish the QuantChat session.');
  }
  return {
    accessToken: data.data.accessToken,
    refreshToken:
      typeof data.data.refreshToken === 'string'
        ? data.data.refreshToken
        : data.data.accessToken,
  };
}

/** Maps internal SSO failures to honest, non-technical login-page copy. */
function errorRedirect(origin: string, code: string): NextResponse {
  const url = new URL('/login', origin);
  url.searchParams.set('auth_error', code);
  return NextResponse.redirect(url, { headers: { 'cache-control': 'no-store' } });
}

function loginReadyUrl(origin: string, destination: string): URL {
  const url = new URL('/login', origin);
  url.searchParams.set('sso', 'ready');
  if (destination !== '/') url.searchParams.set('returnTo', destination);
  return url;
}

function clearSsoCookies(response: NextResponse): void {
  for (const name of [SSO_STATE_COOKIE, SSO_VERIFIER_COOKIE, SSO_RETURN_COOKIE]) {
    response.cookies.set(name, '', { path: '/', maxAge: 0 });
  }
}
