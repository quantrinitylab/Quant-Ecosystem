import { NextRequest, NextResponse } from 'next/server';
import { setSessionCookies } from '../../../_lib/session-cookies';

const BACKEND_URL =
  process.env.QUANTCHAT_BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://localhost:3002';

/**
 * POST /api/auth/sso/exchange — proxy to the QuantChat backend's
 * `POST /auth/sso/exchange`.
 *
 * Exchanges a QuantMail-issued SSO JWT for QuantChat-native tokens. The raw
 * QuantMail JWT is NOT valid for QuantChat's backend (different secret /
 * issuer / audience), so the login page must call this before persisting any
 * session — otherwise `/auth/me` 401s, `useAuth` fail-closes, and the user
 * bounces back to /login.
 */
export async function POST(request: NextRequest) {
  let ssoToken: unknown = null;
  try {
    const body = await request.json();
    ssoToken = (body as { ssoToken?: unknown })?.ssoToken ?? null;
  } catch {
    ssoToken = null;
  }

  if (typeof ssoToken !== 'string' || ssoToken.length < 10) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'BAD_REQUEST', message: 'ssoToken is required' },
      },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${BACKEND_URL}/auth/sso/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ssoToken }),
    });
    const data = await res.json().catch(() => null);
    const resp = NextResponse.json(
      data ?? { success: false, error: { code: 'EXCHANGE_FAILED', message: 'SSO exchange failed' } },
      { status: res.status },
    );
    // QC-F-154 (Slice-1 / Release A): make the exchanged pair the canonical
    // HttpOnly session cookies. The body still carries the tokens for the old
    // client (Release B stops reading it); the LoginPage
    // `refreshToken || accessToken` fallback dies with Release B, and until
    // then a refresh that is absent simply means no refresh cookie is set —
    // the access token is NEVER stored in the refresh cookie's place.
    if (res.ok) {
      const issued = (data as { data?: { accessToken?: unknown; refreshToken?: unknown } } | null)?.data;
      const accessToken = issued?.accessToken;
      if (typeof accessToken === 'string' && accessToken) {
        const refreshToken = issued?.refreshToken;
        setSessionCookies(resp, {
          accessToken,
          refreshToken: typeof refreshToken === 'string' && refreshToken ? refreshToken : undefined,
        });
      }
    }
    return resp;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Auth backend is unavailable' },
      },
      { status: 502 },
    );
  }
}
