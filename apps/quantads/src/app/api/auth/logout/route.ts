import { NextRequest, NextResponse } from 'next/server';
import { buildClearSessionCookies } from '@quant/api-client/sso-server';

// QuantAds — POST /api/auth/logout.
//
// Best-effort revocation at QuantMail's /oauth/revoke, then clear every SSO
// session cookie. The client is signed out regardless of the revocation
// result.
const QUANTMAIL_URL = process.env.QUANTMAIL_BACKEND_URL || 'http://localhost:3010';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const cookie = request.headers.get('cookie') ?? '';
  try {
    await fetch(`${QUANTMAIL_URL}/oauth/revoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, 'cache-control': 'no-store' },
      body: await request.text().catch(() => undefined),
      cache: 'no-store',
    });
  } catch {
    // Best effort — clear locally regardless of revocation result.
  }

  const res = NextResponse.json(
    { success: true },
    { headers: { 'cache-control': 'no-store' } },
  );
  for (const c of buildClearSessionCookies()) res.headers.append('set-cookie', c);
  return res;
}
