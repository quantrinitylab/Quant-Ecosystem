import { NextRequest, NextResponse } from 'next/server';

const QUANTMAIL_BACKEND_URL = process.env.QUANTMAIL_BACKEND_URL || 'http://localhost:3010';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { email, password } = body;

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_EMAIL', message: 'Valid email is required' } },
      { status: 400 },
    );
  }

  if (!password || typeof password !== 'string' || password.length < 1) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_PASSWORD', message: 'Password is required' } },
      { status: 400 },
    );
  }

  // Proxy to central QuantMail identity provider
  try {
    const res = await fetch(`${QUANTMAIL_BACKEND_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (res.ok) {
      const rawData = await res.json();
      const token = rawData?.data?.accessToken || rawData?.accessToken;
      const user = rawData?.data?.user || rawData?.user || null;

      // Strip tokens completely from JSON body to prevent client-side exfiltration (Astra W32-12)
      const response = NextResponse.json({ success: true, data: { user } }, { status: 200 });

      if (token) {
        // Enforce secure cookie on production and HTTPS staging environments
        const isSecure =
          process.env.NODE_ENV === 'production' || request.url.startsWith('https://');
        response.cookies.set('quant_access_token', token, {
          httpOnly: true,
          secure: isSecure,
          sameSite: 'lax',
          path: '/',
          maxAge: 3600, // 1 hour aligned with token expiration
        });
      }

      return response;
    }

    const err = await res.json().catch(() => null);
    return NextResponse.json(
      {
        success: false,
        error: err?.error ?? {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      },
      { status: res.status || 401 },
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'AUTH_SERVICE_UNAVAILABLE',
          message: 'Identity service currently unreachable. Please try again shortly.',
        },
      },
      { status: 502 },
    );
  }
}
