// ============================================================================
// QuantCooks — POST /api/auth/sso/exchange
//
// QuantMail's SSO account chooser redirects back to QuantCooks with a
// QuantMail-issued JWT in the URL (?token=...). That JWT is minted by the
// ecosystem identity root (the QuantMail backend, JWT issuer
// https://quantrinity.in) — the same issuer QuantCooks uses for password
// logins — so unlike QuantChat we do NOT need to mint app-native tokens. But
// we must never trust the token on its claims alone: this route verifies it
// back-channel (server-side) against the identity service's /oauth/userinfo
// before the browser is allowed to treat it as a session.
//
// Returns { success: true, data: { accessToken } } on a verified token.
// Never echoes user PII back to the caller.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const IDENTITY_URL = (
  process.env['QUANT_IDENTITY_URL'] ??
  process.env['QUANTMAIL_BACKEND_URL'] ??
  'http://quant-quantmail-backend:3011'
).replace(/\/$/, '');

const VERIFY_TIMEOUT_MS = 8000;

function failResponse(statusCode: number, code: string, message: string) {
  return NextResponse.json(
    { success: false, error: { code, message, statusCode } },
    { status: statusCode, headers: { 'cache-control': 'no-store' } },
  );
}

export async function POST(request: NextRequest) {
  let ssoToken: unknown = null;
  try {
    const body = await request.json();
    ssoToken = (body as { ssoToken?: unknown } | null)?.ssoToken ?? null;
  } catch {
    ssoToken = null;
  }

  if (typeof ssoToken !== 'string' || ssoToken.trim().length < 10) {
    return failResponse(400, 'BAD_REQUEST', 'ssoToken is required.');
  }
  const token = ssoToken.trim();

  // Back-channel verification: the identity service validates the Bearer <redacted>
  // (signature, expiry, revocation) and only then returns the user profile.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const res = await fetch(`${IDENTITY_URL}/oauth/userinfo`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
      cache: 'no-store',
    });

    if (res.status === 401 || res.status === 403) {
      return failResponse(
        401,
        'INVALID_SSO_TOKEN',
        'The Quant Account sign-in token was rejected. Please try again.',
      );
    }
    if (!res.ok) {
      return failResponse(
        502,
        'IDENTITY_UNAVAILABLE',
        'The sign-in service is temporarily unavailable.',
      );
    }

    const data = (await res.json().catch(() => null)) as {
      success?: boolean;
      data?: { email?: unknown };
      email?: unknown;
    } | null;
    const email = data?.data?.email ?? data?.email;
    if (data?.success !== true || typeof email !== 'string' || email.trim().length === 0) {
      return failResponse(
        401,
        'INVALID_SSO_TOKEN',
        'The Quant Account sign-in token was rejected. Please try again.',
      );
    }

    // Verified. Hand the (identity-issued) access token to the browser; it is
    // the same token shape password login returns, stored memory-only.
    return NextResponse.json(
      { success: true, data: { accessToken: token } },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch {
    return failResponse(
      502,
      'UPSTREAM_UNAVAILABLE',
      'The sign-in service is temporarily unavailable.',
    );
  } finally {
    clearTimeout(timeout);
  }
}
