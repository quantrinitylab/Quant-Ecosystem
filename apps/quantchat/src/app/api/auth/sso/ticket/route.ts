import { NextRequest, NextResponse } from 'next/server';
import { safeReturnPath } from '../../../../../lib/sso-oauth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BACKEND_URL =
  process.env.QUANTCHAT_BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://localhost:3002';

/**
 * POST /api/auth/sso/ticket — Contract-B chooser ticket redemption.
 *
 * Body: { ticket, returnTo? }. The ticket is verified with QuantMail and
 * QuantChat-native tokens are minted server-side via the backend
 * /auth/sso/exchange (which verifies the ticket back-channel — never trusted
 * on its claims alone). The session is parked in HttpOnly cookies; the
 * response also returns the tokens + verified user so the login page can
 * prime the app's Bearer <redacted> consumers (apiClient, realtime socket)
 * exactly like the password login does. The ticket itself never lingers: the
 * login page scrubs it from the URL via history.replaceState before calling
 * here.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    ticket?: unknown;
    returnTo?: unknown;
  } | null;
  const ticket = typeof body?.ticket === 'string' ? body.ticket : '';
  const returnTo =
    safeReturnPath(typeof body?.returnTo === 'string' ? body.returnTo : null) ?? '/';

  if (!ticket || ticket.length < 8 || ticket.length > 4096) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'BAD_REQUEST', message: 'A sign-in ticket is required.' },
      },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(new URL('/auth/sso/exchange', BACKEND_URL).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ssoTicket: ticket }),
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => null)) as {
      success?: boolean;
      data?: {
        accessToken?: string;
        refreshToken?: string;
        user?: unknown;
      };
      error?: { message?: string };
    } | null;

    if (
      !res.ok ||
      !data?.success ||
      typeof data.data?.accessToken !== 'string'
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_SSO_TICKET',
            message:
              data?.error?.message ??
              'The QuantMail sign-in ticket was rejected or expired. Please try again.',
          },
        },
        { status: 401, headers: { 'cache-control': 'no-store' } },
      );
    }

    const accessToken = data.data.accessToken;
    const refreshToken =
      typeof data.data.refreshToken === 'string' ? data.data.refreshToken : accessToken;
    const secure = request.url.startsWith('https://') || process.env.NODE_ENV === 'production';
    const response = NextResponse.json(
      {
        success: true,
        data: { user: data.data.user ?? null, accessToken, refreshToken, returnTo },
      },
      { headers: { 'cache-control': 'no-store' } },
    );
    response.cookies.set('quant_access_token', accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 3600,
    });
    response.cookies.set('quant_refresh_token', refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });
    return response;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SSO_VERIFY_UNAVAILABLE',
          message: 'Could not verify the sign-in ticket. Please try again.',
        },
      },
      { status: 502 },
    );
  }
}
