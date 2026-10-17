import { NextRequest, NextResponse } from 'next/server';

// QuantMail identity root. QUANTMAIL_BACKEND_URL is set in every deployment
// (compose/quant-stack.yml); the localhost fallback is for local dev only.
const QUANTMAIL_BACKEND_URL = process.env.QUANTMAIL_BACKEND_URL || 'http://localhost:3010';

// QuantAI web tier — QuantMail opaque-ticket SSO handoff.
//
// The browser hands us the single-use `__quant_sso_ticket` it received from
// the QuantMail /sso chooser. We NEVER verify the ticket here (it is opaque to
// us and can never validate as an access token); we exchange it server-to-server
// with the identity root (POST /sso/ticket/exchange), presenting our OAuth
// client credentials. The identity root validates the ticket + credentials and
// returns the identity plus a freshly minted access token, which becomes the
// QuantAI session.
//
// (Previously this route proxied to a dedicated QuantAI backend at
// QUANTAI_BACKEND_URL that was never deployed in any environment, so the
// exchange always failed. The identity root now exposes the exchange
// directly.)
//
// On success we set the HttpOnly `quant_access_token` cookie with the same
// attributes as the hardened login route, and return the identity + session
// token in the same-origin JSON body (never in a URL) so the frontend can
// populate its Authorization header, exactly like the /auth/refresh flow.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RESOLVE_TIMEOUT_MS = 15_000;

/**
 * Resolve deadline (ms) for the call to our own backend. Overridable via env
 * so tests can exercise the timeout path quickly.
 */
function resolveTimeoutMs(): number {
  const raw = process.env['QUANT_SSO_WEB_RESOLVE_TIMEOUT_MS'];
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : RESOLVE_TIMEOUT_MS;
}

const errorResponse = (statusCode: number, code: string, message: string) =>
  NextResponse.json(
    { success: false, error: { code, message, statusCode } },
    { status: statusCode, headers: { 'cache-control': 'no-store' } },
  );

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const ticket = body && typeof body['ticket'] === 'string' ? (body['ticket'] as string).trim() : '';
  if (!ticket) {
    return errorResponse(400, 'SSO_TICKET_MISSING', 'A sign-in ticket is required.');
  }

  // OAuth client credentials for the server-to-server exchange. Without them
  // the identity root cannot authenticate us — fail with the honest
  // misconfigured copy instead of a confusing downstream 401.
  const clientId = process.env['QUANT_SSO_CLIENT_ID'];
  const clientSecret = process.env['QUANT_SSO_CLIENT_SECRET'];
  if (!clientId || !clientSecret) {
    return errorResponse(
      500,
      'SSO_CLIENT_MISCONFIGURED',
      'Single sign-on is not configured for QuantAI yet.',
    );
  }

  // ONE deadline covers headers AND body: the timer is cleared only after
  // the backend's response body is fully parsed, so a stalled body fails
  // closed at the deadline instead of hanging the route.
  let backendRes: Response;
  let json: {
    success?: boolean;
    data?: { user?: unknown; accessToken?: unknown; sessionToken?: unknown };
    error?: { code?: string; message?: string; statusCode?: number };
  } | null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), resolveTimeoutMs());
    try {
      // Forward the browser's Origin: the identity backend's trusted-origin
      // check 403s auth-adjacent calls that arrive without one.
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      };
      const origin = request.headers.get('origin');
      if (origin) headers['origin'] = origin;
      backendRes = await fetch(`${QUANTMAIL_BACKEND_URL}/sso/ticket/exchange`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ticket, client_id: clientId, client_secret: clientSecret }),
        signal: controller.signal,
        cache: 'no-store',
      });
      try {
        json = (await backendRes.json()) as typeof json;
      } catch (jsonErr) {
        if (jsonErr instanceof Error && jsonErr.name === 'AbortError') throw jsonErr;
        json = null;
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return errorResponse(
      502,
      'SSO_IDENTITY_UNAVAILABLE',
      'The QuantMail sign-in service is temporarily unreachable. Please try again shortly.',
    );
  }

  if (!backendRes.ok || !json?.success) {
    const err = json?.error;
    return errorResponse(
      backendRes.status || 502,
      typeof err?.code === 'string' ? err.code : 'SSO_FAILED',
      typeof err?.message === 'string' ? err.message : 'Sign-in via QuantMail failed.',
    );
  }

  const sessionToken =
    json.data && typeof json.data.accessToken === 'string'
      ? json.data.accessToken
      : json.data && typeof json.data.sessionToken === 'string'
        ? json.data.sessionToken
        : '';
  const user = json.data?.user ?? null;
  if (!sessionToken || !user) {
    return errorResponse(502, 'SSO_FAILED', 'Sign-in via QuantMail failed.');
  }

  const response = NextResponse.json(
    { success: true, data: { user, sessionToken } },
    { headers: { 'cache-control': 'no-store' } },
  );
  // HttpOnly cookie path consistent with the hardened login route
  // (app/api/auth/login/route.ts).
  const isSecure = process.env.NODE_ENV === 'production' || request.url.startsWith('https://');
  response.cookies.set('quant_access_token', sessionToken, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: 3600,
  });
  return response;
}
