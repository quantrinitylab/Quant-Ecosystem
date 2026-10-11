import { NextRequest, NextResponse } from 'next/server';
import { buildTokenSessionCookies } from '@quant/api-client/sso-server';

// QuantAds — POST /api/auth/refresh.
//
// Rotates a password-login session via QuantMail's /auth/refresh using the
// HttpOnly refresh cookie the login relayed. The rotated access token is
// relayed into the httpOnly session cookie. A missing refresh cookie is a
// clean unauthenticated state (200 NO_SESSION), not an error.
const QUANTMAIL_URL = process.env.QUANTMAIL_BACKEND_URL || 'http://localhost:3010';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const cookie = request.headers.get('cookie') ?? '';
  if (!cookie.includes('quantmail_refresh=')) {
    return NextResponse.json(
      { success: false, error: { code: 'NO_SESSION', message: 'No active session.' } },
      { headers: { 'cache-control': 'no-store' } },
    );
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${QUANTMAIL_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, 'cache-control': 'no-store' },
      cache: 'no-store',
      redirect: 'manual',
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'BACKEND_UNAVAILABLE', message: 'The sign-in service is temporarily unavailable.' },
      },
      { status: 502, headers: { 'cache-control': 'no-store' } },
    );
  }

  const data = (await backendRes.json().catch(() => null)) as {
    success?: boolean;
    data?: { accessToken?: unknown; expiresIn?: unknown };
  } | null;
  if (!data) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INVALID_RESPONSE', message: 'The sign-in service returned an invalid response.' },
      },
      { status: 502, headers: { 'cache-control': 'no-store' } },
    );
  }

  const headers = new Headers({ 'cache-control': 'no-store' });
  const setCookie = backendRes.headers.get('set-cookie');
  if (setCookie) headers.set('set-cookie', setCookie);

  const token = data?.data?.accessToken;
  if (backendRes.ok && data?.success !== false && typeof token === 'string' && token.length > 0) {
    const expiresIn = typeof data?.data?.expiresIn === 'number' ? data.data.expiresIn : undefined;
    for (const c of buildTokenSessionCookies({ accessToken: token, expiresIn })) {
      headers.append('set-cookie', c);
    }
  }

  return NextResponse.json(data, { status: backendRes.status, headers });
}
