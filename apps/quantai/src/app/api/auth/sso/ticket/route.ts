import { NextRequest, NextResponse } from 'next/server';
import { APP_ACCESS_COOKIE, APP_REFRESH_COOKIE, safeReturnPath } from '../../../../../lib/sso-oauth';
import { verifyTicketAndMintSession } from '../callback/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/auth/sso/ticket — Contract-B chooser ticket redemption.
 *
 * Body: { ticket, returnTo? }. The ticket is verified with QuantMail and a
 * QuantAI session is minted server-side (via the backend /auth/sso/exchange),
 * then parked in HttpOnly cookies. The ticket itself never lingers: the login
 * page scrubs it from the URL via history.replaceState before calling here.
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

  const session = await verifyTicketAndMintSession(ticket);
  if (!session) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INVALID_SSO_TICKET',
          message: 'The QuantMail sign-in ticket was rejected or expired. Please try again.',
        },
      },
      { status: 401, headers: { 'cache-control': 'no-store' } },
    );
  }

  const response = NextResponse.json(
    { success: true, data: { user: session.user, returnTo } },
    { headers: { 'cache-control': 'no-store' } },
  );
  const secure = request.url.startsWith('https://') || process.env.NODE_ENV === 'production';
  const opts = {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
  };
  response.cookies.set(APP_ACCESS_COOKIE, session.accessToken, { ...opts, maxAge: 3600 });
  response.cookies.set(APP_REFRESH_COOKIE, session.refreshToken, {
    ...opts,
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}
