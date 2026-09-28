import type { NextRequest } from 'next/server';
import { proxyFeedRequest } from '../../_lib/feed-proxy';

// POST /api/feed/candidates — seed/extend a feed's candidate pool.
export async function POST(request: NextRequest) {
  return proxyFeedRequest(request, '/feed/candidates', {
    body: await request.json().catch(() => ({})),
  });
}
