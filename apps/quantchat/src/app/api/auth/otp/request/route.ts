import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { phoneNumber, countryCode } = body;

    if (!phoneNumber) {
      return NextResponse.json(
        { success: false, error: { message: 'Phone number is required' } },
        { status: 400 },
      );
    }

    // Normalize phone number: keep only digits and plus sign
    const normalizedPhone = phoneNumber.replace(/[^\d+]/g, '');
    const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3002';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    try {
      const response = await fetch(new URL('/auth/otp/request', BACKEND_URL).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: normalizedPhone, countryCode }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // QC-F-442: the backend is the ONLY authority on whether an OTP may
      // be requested (the verify route's pattern, QC-F-091). Its deliberate
      // answers are passed through verbatim — 2xx success, 400 BAD_REQUEST,
      // and 429 OTP_REQUEST_FAILED with its `metadata.retryAfter` — instead
      // of being masked as a fake 503 'service unavailable', which lied to
      // rate-limited users (no real reason, no retryAfter) and to users
      // whose request was simply invalid. Only a genuine upstream failure
      // earns the 503 below: a 5xx here, or a network error / timeout /
      // unparseable body landing in the catch.
      if (response.status >= 500) {
        throw new Error(`Backend error: ${response.status}`);
      }

      const data = await response.json();
      // Defense-in-depth (QC-F-062): the backend must never return the OTP
      // itself, but strip `demoCode` at this layer too so a stale/older
      // backend behind this proxy cannot leak the code to the browser.
      // This strip is a second wall, not a substitute for the backend fix,
      // and it applies to every body this proxy forwards, errors included.
      if (data && typeof data === 'object') {
        delete (data as Record<string, unknown>).demoCode;
        const inner = (data as Record<string, unknown>).data;
        if (inner && typeof inner === 'object') {
          delete (inner as Record<string, unknown>).demoCode;
        }
      }
      return NextResponse.json(data, { status: response.status });
    } catch (error) {
      clearTimeout(timeoutId);

      // FAIL CLOSED: when the upstream OTP provider is unreachable, answers
      // 5xx, or returns an unparseable body, do NOT mint a working
      // fallback/demo code. Return an error so the client cannot
      // authenticate without a real OTP. (Deliberate 2xx/4xx answers never
      // land here — QC-F-442 passes them through verbatim above.)
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'Verification service is unavailable. Please try again later.',
            code: 'OTP_UPSTREAM_UNAVAILABLE',
          },
        },
        { status: 503 },
      );
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { message: error.message } },
      { status: 500 },
    );
  }
}
