// ============================================================================
// POST /api/quanty/referral/redeem — redeem a referral code.
//
// The referral program is NOT live yet: there is no ledger, no grant, and no
// fake "success" is ever returned. This route validates the request honestly
// (401 without auth, 400 on malformed input) and answers 501 while the
// program is unavailable, so the UI can relay a truthful message and the
// wiring is ready when the ledger lands.
// ============================================================================
import { NextResponse } from 'next/server';

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{4,18}[A-Z0-9]$/;

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.length <= 7) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: sign in to redeem a code.' },
      { status: 401 },
    );
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const code =
    body && typeof body === 'object' && 'code' in body
      ? String((body as { code: unknown }).code ?? '').trim().toUpperCase()
      : '';

  if (!code) {
    return NextResponse.json(
      { success: false, error: 'Enter a referral code.' },
      { status: 400 },
    );
  }
  if (!CODE_PATTERN.test(code)) {
    return NextResponse.json(
      {
        success: false,
        error: 'That code does not look valid. Codes are 6–20 letters, digits, or dashes.',
      },
      { status: 400 },
    );
  }

  // No referral ledger exists yet — honest 501, never a fabricated success.
  return NextResponse.json(
    {
      success: false,
      code: 'REFERRAL_NOT_LIVE',
      error:
        'Referral rewards are not live yet, so this code cannot be redeemed right now. ' +
        'Your code was recognized as well-formed and nothing was charged or granted.',
    },
    { status: 501 },
  );
}
