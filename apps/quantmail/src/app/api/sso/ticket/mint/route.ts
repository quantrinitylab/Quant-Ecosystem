import { NextRequest } from 'next/server';

import { proxyToBackend } from '../../../_lib/proxy';

// Mints a single-use opaque SSO ticket for the caller's session. The bearer
// token travels in the Authorization header of this POST only — it is never
// placed in a redirect URL.
export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/sso/ticket/mint');
}
