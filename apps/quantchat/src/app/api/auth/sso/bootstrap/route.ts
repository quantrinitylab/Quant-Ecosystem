import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BACKEND_URL =
  process.env.QUANTCHAT_BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://localhost:3002';

/**
 * GET /api/auth/sso/bootstrap — primes the browser's Bearer <redacted> from the
 * HttpOnly SSO session cookie.
 *
 * After /api/auth/sso/callback redirects to /login?sso=ready, the login page
 * calls this. The server reads the HttpOnly `quant_access_token` cookie,
 * verifies it against the backend (/auth/me — fail closed), and returns the
 * verified user plus the tokens so the page can prime the app's Bearer
 * consumers (apiClient, realtime-socket subprotocol) exactly like the password
 * login does. No token ever appears in the URL.
 */
export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('quant_access_token')?.value ?? '';
  if (!accessToken) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'NO_SESSION', message: 'No SSO session found.' },
      },
      { status: 401, headers: { 'cache-control': 'no-store' } },
    );
  }

  try {
    const meRes = await fetch(new URL('/auth/me', BACKEND_URL).toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    const meData = (await meRes.json().catch(() => null)) as {
      success?: boolean;
      data?: unknown;
    } | null;
    if (!meRes.ok || !meData?.success || !meData.data) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_SESSION', message: 'The SSO session is not valid.' },
        },
        { status: 401, headers: { 'cache-control': 'no-store' } },
      );
    }
    const refreshToken = request.cookies.get('quant_refresh_token')?.value ?? accessToken;
    return NextResponse.json(
      {
        success: true,
        data: { user: meData.data, accessToken, refreshToken },
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Auth service unavailable.' },
      },
      { status: 502 },
    );
  }
}
