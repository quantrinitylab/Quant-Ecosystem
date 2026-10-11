import { NextRequest, NextResponse } from 'next/server';
import { QUANTAI_BACKEND_URL } from '../../../_lib/agent-proxy';

// QuantAI web tier — QuantMail opaque-ticket SSO handoff.
//
// The browser hands us the single-use `__quant_sso_ticket` it received from
// the QuantMail /sso chooser. We NEVER verify the ticket here (it is opaque to
// us and can never validate as an access token); we forward it to our own
// backend (POST /auth/sso/ticket), which resolves it server-to-server with the
// identity root and mints a QuantAI SSO session.
//
// On success we set the HttpOnly `quant_access_token` cookie with the same
// attributes as the hardened login route, and return the identity + session
// token in the same-origin JSON body (never in a URL) so the frontend can
// populate its Authorization header, exactly like the /auth/refresh flow.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RESOLVE_TIMEOUT_MS = 15_000;

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

  let backendRes: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);
    try {
      backendRes = await fetch(`${QUANTAI_BACKEND_URL}/auth/sso/ticket`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        body: JSON.stringify({ ticket }),
        signal: controller.signal,
        cache: 'no-store',
      });
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

  const json = (await backendRes.json().catch(() => null)) as {
    success?: boolean;
    data?: { user?: unknown; sessionToken?: unknown };
    error?: { code?: string; message?: string; statusCode?: number };
  } | null;

  if (!backendRes.ok || !json?.success) {
    const err = json?.error;
    return errorResponse(
      backendRes.status || 502,
      typeof err?.code === 'string' ? err.code : 'SSO_FAILED',
      typeof err?.message === 'string' ? err.message : 'Sign-in via QuantMail failed.',
    );
  }

  const sessionToken =
    json.data && typeof json.data.sessionToken === 'string' ? json.data.sessionToken : '';
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
