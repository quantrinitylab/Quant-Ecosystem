import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL =
  process.env.QUANTCHAT_BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://localhost:3002';

/**
 * POST /api/auth/refresh — proxy to the QuantChat backend's
 * `POST /auth/refresh`.
 *
 * WHY THIS EXISTS: the web apiClient calls `/api/auth/refresh` whenever a
 * data request returns 401, but this route never existed — the request hit
 * Next's 404, refresh always failed, and sessions died at access-token
 * expiry (1h) even with a valid 30-day refresh token. The backend now
 * verifies the refresh token (signature + `kind: 'refresh'` claim) and
 * rotates a fresh pair; this proxy forwards it and mirrors the rotated
 * access token into the HttpOnly session cookies (same flags as the
 * userinfo/proxy cookie writers) so cookie readers stay in sync.
 *
 * Fail closed: an unreachable backend is a 502, never a fabricated success.
 */
export async function POST(request: NextRequest) {
  let refreshToken: unknown = null;
  try {
    const body = await request.json();
    refreshToken = (body as { refreshToken?: unknown })?.refreshToken ?? null;
  } catch {
    refreshToken = null;
  }

  if (typeof refreshToken !== 'string' || refreshToken.length < 10) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'BAD_REQUEST', message: 'refreshToken is required' },
      },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${BACKEND_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const data = (await res.json().catch(() => null)) as Record<string, any> | null;
    if (!data) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_RESPONSE', message: 'Auth backend returned an invalid response' },
        },
        { status: 502 },
      );
    }

    const nextResp = NextResponse.json(data, { status: res.status });
    const newAccessToken = data?.data?.accessToken;
    if (res.ok && typeof newAccessToken === 'string' && newAccessToken) {
      const cookieOptions = {
        path: '/',
        httpOnly: true,
        // Secure only in production so http://localhost dev login keeps working;
        // staging + prod are HTTPS, where the Secure flag is enforced.
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
      };
      nextResp.cookies.set('quant_access_token', newAccessToken, cookieOptions);
      nextResp.cookies.set('token', newAccessToken, cookieOptions);
    }
    return nextResp;
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
