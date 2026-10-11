import { NextRequest } from 'next/server';

import { proxyToBackend } from '../../../_lib/proxy';

// Server-to-server ticket resolution for receiving apps' backends. Caller
// presents the ticket plus its OAuth client credentials; receives the user's
// identity (never any token). Auth is enforced by the backend handler.
export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/sso/ticket/resolve');
}
