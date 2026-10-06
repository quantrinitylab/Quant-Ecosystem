import { NextResponse } from 'next/server';
import { activeOtpCodes } from '../store';

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

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
      }
      throw new Error(`Backend error: ${response.status}`);
    } catch (error) {
      clearTimeout(timeoutId);

      // Fallback: verify ONLY against codes issued by this service's own
      // store (which can only hold codes issued with a real SMS). There is
      // no universal/demo code — '123456' was removed as a critical auth
      // backdoor. If the upstream provider and the local store both have no
      // valid code, verification fails.
      const fallbackEntry = activeOtpCodes.get(normalizedPhone);

      let isValid = false;
      if (
        fallbackEntry &&
        fallbackEntry.code === otp &&
        fallbackEntry.expiresAt > Date.now()
      ) {
        isValid = true;
      }

      if (isValid) {
        // cleanup
        activeOtpCodes.delete(normalizedPhone);

        const phoneBuffer = Buffer.from(normalizedPhone).toString('hex');
        const token = `qchat_sess_${Date.now()}_${phoneBuffer}`;
        const user = {
          id: 'user_' + phoneBuffer.slice(0, 12),
          phoneNumber: normalizedPhone,
          username: 'User ' + normalizedPhone.slice(-4),
          role: 'USER',
        };

        return NextResponse.json(
          {
            success: true,
            data: {
              accessToken: token,
              refreshToken: token + '_rf',
              user,
              isFallback: true,
            },
          },
          { status: 200 },
        );
      } else {
        return NextResponse.json(
          {
            success: false,
            error: { message: 'Invalid or expired verification code' },
          },
          { status: 400 },
        );
      }
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { message: error.message } },
      { status: 500 },
    );
  }
}
