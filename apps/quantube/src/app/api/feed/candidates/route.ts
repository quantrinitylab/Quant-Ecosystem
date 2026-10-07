import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// POST /api/feed/candidates — seed/extend a feed's candidate pool.
export async function POST(request: NextRequest) {
  return proxyEngineRequest(request, '/feed/candidates', {
    body: await request.json().catch(() => ({})),
  });
}
