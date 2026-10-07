import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL =
  process.env.QUANTUBE_BACKEND_URL ??
  process.env.NEXT_PUBLIC_QUANTUBE_BACKEND_URL ??
  'http://localhost:3006';

/**
 * FAIL-CLOSED response when the upstream auth backend is unavailable.
 *
 * P0-A fix (identity forgery class): the previous implementation *fabricated*
 * user identities here — base64-decoding UNVERIFIED JWT payloads
 * (`Buffer.from(payloadBase64, 'base64')`) and returning `success:true` +
 * `phoneVerified:true` + `kycStatus:'verified'` in HTTP 200 for
 * attacker-controlled token content, plus fabricated `user-1` identities for
 * any `quant_`/`sso_`/`qchat_sess_` prefixed token. Any client holding a token
 * the backend never issued could mint an arbitrary identity without any
 * server-side verification.
 *
 * New behavior — never invent an identity:
 *   - missing/empty authorization header -> 401 UNAUTHORIZED
 *   - backend down / unreachable / 502/503/504 -> 503 UPSTREAM_UNAVAILABLE
 *   - upstream 401 with failed SSO exchange -> 401 UNAUTHORIZED (explicit)
 *
 * Clients must retry against a real backend instead of trusting a fabricated
 * identity.
 */
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
  // Fabricated identities were the P0-A flaw (see doc comment above).
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

/**
 * OIDC-style userinfo proxy with fail-closed offline behavior.
 * Forwards GET /api/auth/userinfo to upstream backend /auth/me.
 * If the backend is offline or unreachable, responds 503 UPSTREAM_UNAVAILABLE
 * (no fabricated identity). A failed SSO token exchange after an upstream 401
 * responds 401 UNAUTHORIZED.
 */
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
    const res = await fetch(new URL('/auth/me', BACKEND_URL).toString(), {
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
      // Transparent SSO ticket exchange (mirrors quantchat PR #405).
      // If this backend does not implement /auth/sso/exchange, the fetch
      // fails or returns non-ok and we fail closed with 401 below.
      try {
        const exchangeRes = await fetch(new URL('/auth/sso/exchange', BACKEND_URL).toString(), {
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

      // P0-A: failed exchange must NOT fall back to a fabricated identity.
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
      { status: 401 },
    );
  } catch {
    return handleFallback(authHeader);
  } finally {
    clearTimeout(timeoutId);
  }
}
