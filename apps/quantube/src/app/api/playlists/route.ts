import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../_lib/engine-proxy';

// GET /api/playlists — the caller's playlist list. Repointed onto the
// canonical `proxyEngineRequest` and the registered backend `/playlists`
// route (replacing the legacy `_lib/proxy.ts` helper). Req 7.1, 7.4.
export async function GET(request: NextRequest) {
  return proxyEngineRequest(request, '/playlists', {
    searchParams: request.nextUrl.searchParams,
  });
}

// POST /api/playlists — create a playlist. Forwards the parsed JSON body.
// Req 7.1, 7.5.
export async function POST(request: NextRequest) {
  return proxyEngineRequest(request, '/playlists', {
    body: await request.json().catch(() => ({})),
  });
}
