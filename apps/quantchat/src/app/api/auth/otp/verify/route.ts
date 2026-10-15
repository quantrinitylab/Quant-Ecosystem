import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { phoneNumber, otp, deviceId } = body;

    if (!phoneNumber || !otp) {
      return NextResponse.json(
        { success: false, error: { message: 'Phone number and OTP are required' } },
        { status: 400 },
      );
    }

    const normalizedPhone = phoneNumber.replace(/[^\d+]/g, '');
    const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3002';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    try {
      const response = await fetch(new URL('/auth/otp/verify', BACKEND_URL).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: normalizedPhone, otp, deviceId }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // The backend is the ONLY authority that can verify an OTP and issue
      // tokens. Whatever it answers — success or rejection — is passed
      // through verbatim; this proxy never second-guesses it.
      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
    } catch (error) {
      clearTimeout(timeoutId);

      // FAIL CLOSED (QC-F-091): when the upstream OTP provider is
      // unreachable, do NOT fall back to a locally stored code and never
      // mint a token or fabricate a user in this proxy — that was a
      // latent P0-A-class identity forgery (any future writer populating
      // the local store would have turned it into a live backdoor).
      // Mirror the request route: 503 OTP_UPSTREAM_UNAVAILABLE.
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
