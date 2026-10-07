import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// GET /api/playlists/watch-later — the caller's enriched watch-later queue,
// most-recently-added-first. Forwards to the registered backend
// `/playlists/watch-later` route. Req 7.1, 7.4.
export async function GET(request: NextRequest) {
  return proxyEngineRequest(request, '/playlists/watch-later', {
    searchParams: request.nextUrl.searchParams,
  });
}

// POST /api/playlists/watch-later — add a video to Watch Later (idempotent).
// Forwards the parsed JSON body. Req 7.1, 7.5.
export async function POST(request: NextRequest) {
  return proxyEngineRequest(request, '/playlists/watch-later', {
    body: await request.json().catch(() => ({})),
  });
}
