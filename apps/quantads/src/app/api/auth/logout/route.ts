import { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client/proxy';

// POST /api/auth/logout -> QuantMail /oauth/revoke. Best-effort token revocation;
// the client clears its local session regardless of the result.
const QUANTMAIL_URL = process.env.QUANTMAIL_BACKEND_URL || 'http://localhost:3010';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return proxyToBackend(request, { backendUrl: QUANTMAIL_URL, path: '/oauth/revoke', body });
}
