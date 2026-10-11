// ============================================================================
// @quant/api-client - Next.js route-handler factories for QuantMail SSO.
//
// The six social apps mount these at:
//   GET  /api/auth/sso/callback          (Contract A: OAuth2 code + PKCE)
//   POST /api/auth/sso/ticket            (Contract B: /sso chooser ticket)
//   GET  /api/auth/session               (session status from httpOnly cookies)
//   POST /api/auth/password-reset/request (Contract C: forgot-password proxy)
//
// Each app's route file is a one-liner, e.g.
//   export const GET = createSsoCallbackHandler({ clientId: 'quantgram', loginPath: '/login' });
//
// Tokens are exchanged and verified back-channel (server-side) and live only
// in httpOnly + Secure + SameSite=Lax cookies. No tokens ever touch the URL or
// JavaScript. All handlers fail closed with honest, non-enumerating errors.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  SSO_COOKIES,
  SsoError,
  SsoTokens,
  SsoUser,
  buildClearSessionCookies,
  buildClearSsoRequestCookies,
  buildTokenSessionCookies,
  exchangeAuthorizationCode,
  mintIdentitySessionCookie,
  parseCookies,
  readIdentitySessionCookie,
  refreshOAuthTokens,
  requestPasswordResetUpstream,
  safeEqual,
  safeReturnPath,
  verifySessionAccessToken,
  verifySsoTicket,
} from './sso-server';

const NO_STORE = { 'cache-control': 'no-store' } as const;

function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { ...NO_STORE } });
}

/** Only safe identity fields cross the server boundary — never tokens. */
function publicUser(user: SsoUser) {
  return {
    id: user.id,
    email: user.email,
    username: user.username ?? null,
    displayName: user.displayName ?? null,
    avatarUrl: user.avatarUrl ?? null,
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// GET /api/auth/sso/callback — Contract A (OAuth2 authorization-code + PKCE)
// ---------------------------------------------------------------------------

export interface SsoCallbackOptions {
  /** OAuth client_id registered at QuantMail (e.g. 'quantgram'). */
  clientId: string;
  /** App's login page path, for failure redirects (e.g. '/login', '/auth/login'). */
  loginPath?: string;
}

export function createSsoCallbackHandler(options: SsoCallbackOptions) {
  const { clientId, loginPath = '/login' } = options;
  return async function GET(request: NextRequest): Promise<NextResponse> {
    const failRedirect = (code: string): NextResponse => {
      const res = NextResponse.redirect(new URL(`${loginPath}?error=${code}`, request.url), {
        headers: { ...NO_STORE },
      });
      for (const c of buildClearSsoRequestCookies()) res.headers.append('set-cookie', c);
      return res;
    };

    const params = request.nextUrl.searchParams;
    // The user (or QuantMail) cancelled — back to login with an honest code.
    if (params.get('error')) return failRedirect('sso_cancelled');

    const code = params.get('code');
    const state = params.get('state');
    const expectedState = request.cookies.get(SSO_COOKIES.state)?.value;
    const verifier = request.cookies.get(SSO_COOKIES.verifier)?.value;
    const redirectUri = request.cookies.get('quant_sso_redirect')?.value;
    const returnTo = safeReturnPath(request.cookies.get(SSO_COOKIES.returnTo)?.value) ?? '/';

    // Fail closed on any missing/mismatched round-trip value — no exchange.
    if (
      !code ||
      !state ||
      !expectedState ||
      !verifier ||
      !redirectUri ||
      !safeEqual(expectedState, state)
    ) {
      return failRedirect('sso_failed');
    }

    let tokens: SsoTokens;
    try {
      tokens = await exchangeAuthorizationCode({
        code,
        redirectUri,
        clientId,
        codeVerifier: verifier,
      });
    } catch (err) {
      const code2 =
        err instanceof SsoError && err.code === 'CODE_REJECTED' ? 'sso_rejected' : 'sso_failed';
      return failRedirect(code2);
    }

    // Back-channel verification: the access token must identify a real user
    // at the provider before we mint any session.
    const user = await verifySessionAccessToken(tokens.accessToken);
    if (!user) return failRedirect('sso_failed');

    const res = NextResponse.redirect(new URL(returnTo, request.url), {
      headers: { ...NO_STORE },
    });
    for (const c of buildTokenSessionCookies(tokens)) res.headers.append('set-cookie', c);
    for (const c of buildClearSsoRequestCookies()) res.headers.append('set-cookie', c);
    return res;
  };
}

// ---------------------------------------------------------------------------
// POST /api/auth/sso/ticket — Contract B (/sso chooser ticket)
// ---------------------------------------------------------------------------

export function createSsoTicketHandler() {
  return async function POST(request: NextRequest): Promise<NextResponse> {
    let ticket: unknown = null;
    try {
      ticket = (await request.json().catch(() => null) as { ticket?: unknown } | null)?.ticket ?? null;
    } catch {
      ticket = null;
    }
    if (typeof ticket !== 'string' || ticket.trim().length < 8 || ticket.trim().length > 4096) {
      return json(
        {
          success: false,
          error: { code: 'BAD_REQUEST', message: 'A valid sign-in ticket is required.' },
        },
        400,
      );
    }

    // Back-channel verification: the ticket is single-use and NOT a token —
    // the provider returns identity only, never tokens.
    const user = await verifySsoTicket({ ticket: ticket.trim() });
    if (!user) {
      return json(
        {
          success: false,
          error: {
            code: 'INVALID_SSO_TICKET',
            message: 'The QuantMail sign-in ticket was rejected or expired. Please try again.',
          },
        },
        401,
      );
    }

    // Mint the app session: an HMAC-signed identity cookie (unforgeable by the
    // browser). The response carries the verified profile — never tokens.
    const res = json({ success: true, data: { user: publicUser(user) } });
    res.headers.append('set-cookie', mintIdentitySessionCookie(user));
    return res;
  };
}

// ---------------------------------------------------------------------------
// GET /api/auth/session — session status from httpOnly cookies
// ---------------------------------------------------------------------------

export interface SessionHandlerOptions {
  /** OAuth client_id, used for refresh-token rotation of SSO sessions. */
  clientId: string;
}

export function createSessionHandler(options: SessionHandlerOptions) {
  const { clientId } = options;
  return async function GET(request: NextRequest): Promise<NextResponse> {
    const cookies = parseCookies(request.headers.get('cookie'));
    const noSession = () =>
      json(
        { success: false, error: { code: 'NO_SESSION', message: 'No active session.' } },
        401,
      );

    const accessToken = cookies[SSO_COOKIES.access];
    if (accessToken) {
      const user = await verifySessionAccessToken(accessToken);
      if (user) {
        return json({
          success: true,
          data: { user: publicUser(user), sessionType: 'oauth' as const },
        });
      }
      // Access token is dead — try the OAuth refresh token (SSO sessions).
      const refreshToken = cookies[SSO_COOKIES.refresh];
      if (refreshToken) {
        try {
          const tokens = await refreshOAuthTokens({ refreshToken, clientId });
          const refreshedUser = await verifySessionAccessToken(tokens.accessToken);
          if (refreshedUser) {
            const res = json({
              success: true,
              data: { user: publicUser(refreshedUser), sessionType: 'oauth' as const },
            });
            for (const c of buildTokenSessionCookies(tokens)) res.headers.append('set-cookie', c);
            return res;
          }
        } catch {
          // Refresh failed — fail closed below.
        }
      }
      // Token invalid and not refreshable: clear the dead session cookies so
      // the client stops retrying with them.
      const res = noSession();
      for (const c of buildClearSessionCookies()) res.headers.append('set-cookie', c);
      return res;
    }

    // Contract B identity session (HMAC-signed, minted after ticket verify).
    const identity = readIdentitySessionCookie(cookies[SSO_COOKIES.session]);
    if (identity) {
      return json({
        success: true,
        data: { user: publicUser(identity), sessionType: 'sso-ticket' as const },
      });
    }

    return noSession();
  };
}

// ---------------------------------------------------------------------------
// POST /api/auth/password-reset/request — Contract C (forgot password)
// ---------------------------------------------------------------------------

export function createPasswordResetHandler() {
  return async function POST(request: NextRequest): Promise<NextResponse> {
    let email: unknown = null;
    try {
      email = (await request.json().catch(() => null) as { email?: unknown } | null)?.email ?? null;
    } catch {
      email = null;
    }
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return json(
        {
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Enter a valid email address.' },
        },
        400,
      );
    }

    try {
      // QuantMail always answers 200 (no account enumeration); the reset link
      // is emailed to the user's QuantMail inbox and the password is set there.
      await requestPasswordResetUpstream({ email: email.trim() });
    } catch (err) {
      const message =
        err instanceof SsoError && err.message
          ? err.message
          : 'Could not reach the password-reset service. Please try again later.';
      return json(
        { success: false, error: { code: 'RESET_UNAVAILABLE', message } },
        502,
      );
    }

    return json({ success: true, data: { accepted: true } });
  };
}
