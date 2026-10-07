import { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client/proxy';

// GET /api/auth/userinfo -> QuantMail OIDC /oauth/userinfo. The bearer token is
// forwarded and VERIFIED server-side by QuantMail (the JWT secret never touches
// the client). Fail-closed to 502 when the provider is unreachable.
const QUANTMAIL_URL = process.env.QUANTMAIL_BACKEND_URL || 'http://localhost:3010';

export async function GET(request: NextRequest) {
  return proxyToBackend(request, { backendUrl: QUANTMAIL_URL, path: '/oauth/userinfo' });
}
