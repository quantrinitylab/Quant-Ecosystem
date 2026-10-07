import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// PUT /api/feed/algorithm — switch the caller's ranking algorithm for a feed.
export async function PUT(request: NextRequest) {
  return proxyEngineRequest(request, '/feed/algorithm', {
    method: 'PUT',
    body: await request.json().catch(() => ({})),
  });
}
