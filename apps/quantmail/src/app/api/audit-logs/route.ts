import { NextRequest } from 'next/server';
import { proxyToBackend } from '../_lib/proxy';

export async function GET(request: NextRequest) {
  return proxyToBackend(request, '/audit-logs');
}

// K9 (M20): the client-writable POST /audit-logs endpoint was closed — audit
// records are written server-side by trusted backend code paths only. No POST
// export here means Next answers 405 to client POSTs before they reach the
// backend.
