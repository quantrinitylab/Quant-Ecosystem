import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '@quant/api-client/proxy';
import { createSessionHandler } from '@quant/api-client/sso-routes';

// QuantAds — GET /api/auth/userinfo.
//
// Two modes:
//   1. Authorization header present (legacy callers): proxy to QuantMail OIDC
//      /oauth/userinfo, which VERIFIES the bearer token server-side (the JWT
//      secret never touches the client). Fail-closed to 502 when unreachable.
//   2. No header (cookie sessions): resolve the session from the httpOnly
//      cookies — the OAuth access cookie (verified live via userinfo,
//      self-healing through the refresh cookie) or the signed ticket-identity
//      cookie. 401 when neither verifies. Never returns tokens.
const QUANTMAIL_URL = process.env.QUANTMAIL_BACKEND_URL || 'http://localhost:3010';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const sessionHandler = createSessionHandler({ clientId: 'quantads' });

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (request.headers.get('authorization')) {
    return proxyToBackend(request, { backendUrl: QUANTMAIL_URL, path: '/oauth/userinfo' });
  }
  return sessionHandler(request);
}
