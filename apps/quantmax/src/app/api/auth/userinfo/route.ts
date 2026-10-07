import { NextRequest, NextResponse } from 'next/server';

// QuantMax — GET /api/auth/userinfo (fail-closed SSO handoff verification).
//
// Forwards the browser's Authorization bearer token to the ecosystem identity
// root's /auth/me, which verifies the JWT signature server-side. The
// UniversalSSOTokenBridge calls this before establishing any session from an
// SSO handoff ticket — a forged/tampered ticket fails here and the handoff is
// rejected without setting any authenticated state.
//
// Fail-closed behavior (mirrors quantai/quantchat/quantgram/quantube):
//   - missing/empty authorization header -> 401 UNAUTHORIZED
//   - identity service down / unreachable / 502/503/504 -> 503 UPSTREAM_UNAVAILABLE
//   - upstream 401 with failed SSO exchange -> 401 UNAUTHORIZED (explicit)
//
// The token content is NEVER decoded or trusted here. Clients must retry
// against a real backend instead of trusting a fabricated identity.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const IDENTITY_URL =
  process.env['QUANT_IDENTITY_URL'] ??
  process.env['QUANTMAIL_BACKEND_URL'] ??
  'http://quant-quantmail-backend:3011';

function handleFallback(authHeader: string | null): NextResponse {
  if (!authHeader) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'No authorization header',
        },
      },
      { status: 401 },
    );
  }

  const token = authHeader.replace(/^Bearer\s*/i, '').trim();
  if (!token) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'No authorization header',
        },
      },
      { status: 401 },
    );
  }

  // Fail closed: the token content is NEVER decoded or trusted here.
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'Auth backend is unavailable',
        statusCode: 503,
      },
    },
    { status: 503 },
  );
}

export async function GET(request: NextRequest | Request) {
  const authHeader = request.headers.get('authorization');

  if (!authHeader) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'No authorization header',
        },
      },
      { status: 401 },
    );
  }

  const token = authHeader.replace(/^Bearer\s*/i, '').trim();
  if (!token) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'No authorization header',
        },
      },
      { status: 401 },
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1500);

  try {
    const res = await fetch(new URL('/auth/me', IDENTITY_URL).toString(), {
      method: 'GET',
      headers: { Authorization: authHeader },
      signal: controller.signal,
    });

    if (res.ok) {
      const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (data && typeof data === 'object' && 'success' in data) {
        return NextResponse.json(data, { status: res.status });
      }
      return NextResponse.json({ success: true, data }, { status: res.status });
    }

    if ([502, 503, 504].includes(res.status)) {
      return handleFallback(authHeader);
    }

    if (res.status === 401) {
      // Transparent SSO ticket exchange (mirrors quantai/quantchat). QuantMax
      // does not issue tokens, so a handoff ticket may carry another app's
      // token. If the identity service does not implement /auth/sso/exchange,
      // the fetch fails or returns non-ok and we fail closed with 401 below.
      try {
        const exchangeRes = await fetch(new URL('/auth/sso/exchange', IDENTITY_URL).toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ssoToken: token }),
        });

        if (exchangeRes.ok) {
          const exchangeData = (await exchangeRes.json().catch(() => null)) as Record<
            string,
            any
          > | null;
          if (exchangeData?.data?.user) {
            return NextResponse.json({ success: true, data: exchangeData.data.user });
          }
        }
      } catch {
        // Transparent exchange threw an error — fail closed below (401).
      }

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Unauthorized',
          },
        },
        { status: 401 },
      );
    }

    const errData = await res.json().catch(() => null);
    return NextResponse.json(
      errData || {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Unauthorized',
        },
      },
      { status: res.status },
    );
  } catch {
    return handleFallback(authHeader);
  } finally {
    clearTimeout(timeoutId);
  }
}
