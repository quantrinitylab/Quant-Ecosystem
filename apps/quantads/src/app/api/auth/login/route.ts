import { NextRequest, NextResponse } from 'next/server';
import { buildTokenSessionCookies } from '@quant/api-client/sso-server';

// QuantAds — POST /api/auth/login.
//
// QuantMail is the ecosystem's OAuth2/OIDC identity provider (canonical
// infra/PORTS.md: quantmail backend :3010). Credentials are checked by
// QuantMail's /auth/login; the access token it returns is relayed into our
// httpOnly + Secure + SameSite=Lax session cookie — the browser never holds
// the token in JavaScript or localStorage. The backend's own Set-Cookie
// (HttpOnly refresh cookie) is relayed untouched.
const QUANTMAIL_URL = process.env.QUANTMAIL_BACKEND_URL || 'http://localhost:3010';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const fail = (status: number, code: string, message: string) =>
  NextResponse.json(
    { success: false, error: { code, message, statusCode: status } },
    { status, headers: { 'cache-control': 'no-store' } },
  );

export async function POST(request: NextRequest) {
  const body = await request.text();

  let backendRes: Response;
  try {
    backendRes = await fetch(`${QUANTMAIL_URL}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: body.length > 0 ? body : undefined,
      cache: 'no-store',
      redirect: 'manual',
    });
  } catch {
    return fail(502, 'BACKEND_UNAVAILABLE', 'The sign-in service is temporarily unavailable.');
  }

  const data = (await backendRes.json().catch(() => null)) as {
    success?: boolean;
    data?: { accessToken?: unknown; expiresIn?: unknown };
    error?: { message?: string };
  } | null;
  if (!data) {
    return fail(502, 'INVALID_RESPONSE', 'The sign-in service returned an invalid response.');
  }

  const headers = new Headers({ 'cache-control': 'no-store' });
  const setCookie = backendRes.headers.get('set-cookie');
  if (setCookie) headers.set('set-cookie', setCookie);

  // Relay the access token into the httpOnly session cookie (never to JS).
  const token = data?.data?.accessToken;
  if (backendRes.ok && data?.success !== false && typeof token === 'string' && token.length > 0) {
    const expiresIn = typeof data?.data?.expiresIn === 'number' ? data.data.expiresIn : undefined;
    for (const cookie of buildTokenSessionCookies({ accessToken: token, expiresIn })) {
      headers.append('set-cookie', cookie);
    }
  }

  return NextResponse.json(data, { status: backendRes.status, headers });
}
