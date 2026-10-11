import { NextRequest } from 'next/server';

import { proxyToBackend } from '../../_lib/proxy';

/** GET /api/oauth/grants — the signed-in user's OAuth authorizations. */
export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/oauth/grants');
}
