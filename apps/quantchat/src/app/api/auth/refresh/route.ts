import { NextRequest, NextResponse } from 'next/server';
import {
  checkSameOrigin,
  csrfBlockedResponse,
  getRefreshCredential,
  setSessionCookies,
} from '../../_lib/session-cookies';

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
 *
 * QC-F-154 (Slice-1 / Release A): the refresh credential now comes from the
 * HttpOnly `quant_refresh_token` cookie FIRST (path '/api/auth', so it never
 * rides a data request); the legacy body field still works for one release
 * so the old client keeps working. The `deviceId` the client sends is now
 * forwarded to the backend instead of being silently dropped (QC-F-154
 * brief §2d-4). A successful rotation re-sets BOTH canonical cookies.
 * This route consumes a session cookie, so mutating requests from a foreign
 * origin are rejected (CSRF, QC-F-154 §3.6).
 */
export async function POST(request: NextRequest) {
  if (!checkSameOrigin(request)) return csrfBlockedResponse();

  let bodyRefreshToken: unknown = null;
  let deviceId: unknown = null;
  try {
    const body = await request.json();
    bodyRefreshToken = (body as { refreshToken?: unknown })?.refreshToken ?? null;
    deviceId = (body as { deviceId?: unknown })?.deviceId ?? null;
  } catch {
    bodyRefreshToken = null;
  }

  const refreshToken = getRefreshCredential(request, bodyRefreshToken);
  if (!refreshToken) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'BAD_REQUEST', message: 'refreshToken is required' },
      },
      { status: 400 },
    );
  }

  try {
    const backendBody: Record<string, unknown> = { refreshToken };
    if (typeof deviceId === 'string' && deviceId) backendBody.deviceId = deviceId;
    const res = await fetch(`${BACKEND_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backendBody),
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
    const newRefreshToken = data?.data?.refreshToken;
    if (res.ok && typeof newAccessToken === 'string' && newAccessToken) {
      // Canonical flags + lifetimes (QC-F-154): access 1h on '/', refresh
      // 30d path-scoped to '/api/auth'. Replaces the old no-maxAge mirror
      // writes, which this same helper now governs everywhere.
      setSessionCookies(nextResp, {
        accessToken: newAccessToken,
        refreshToken:
          typeof newRefreshToken === 'string' && newRefreshToken ? newRefreshToken : undefined,
      });
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
