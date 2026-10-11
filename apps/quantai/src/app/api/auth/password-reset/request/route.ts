import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const QUANTMAIL_BASE = (
  process.env['QUANTMAIL_OAUTH_URL'] ||
  process.env['QUANTMAIL_BACKEND_URL'] ||
  'https://quantmail.in'
).replace(/\/$/, '');

/**
 * POST /api/auth/password-reset/request — Contract C.
 *
 * Forwards { email } to QuantMail's POST /api/auth/password-reset/request,
 * which always returns 200 (no account enumeration). The reset link is
 * emailed to the user's QuantMail inbox; they set the new password on
 * QuantMail. Always responds success:true to the browser for the same reason
 * (only 502s when the reset service itself is unreachable).
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!email || !email.includes('@') || email.length > 254) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INVALID_EMAIL', message: 'Enter a valid email address.' },
      },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    // No enumeration either way: any accepted request looks identical.
    let res: Response | null = null;
    for (const path of ['/auth/password-reset/request', '/api/auth/password-reset/request']) {
      const attempt = await fetch(`${QUANTMAIL_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        signal: controller.signal,
      }).catch(() => null);
      if (!attempt) {
        res = null;
        break;
      }
      if (attempt.status === 404) continue;
      res = attempt;
      break;
    }
    if (!res) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'RESET_UNAVAILABLE',
            message: 'The password-reset service is unreachable. Please try again shortly.',
          },
        },
        { status: 502 },
      );
    }
    await res.body?.cancel().catch(() => undefined);
    return NextResponse.json({ success: true }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'RESET_UNAVAILABLE',
          message: 'The password-reset service is unreachable. Please try again shortly.',
        },
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
