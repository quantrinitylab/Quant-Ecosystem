import type { NextRequest } from 'next/server';
import { proxyFeedRequest } from '../../_lib/feed-proxy';

// PUT /api/feed/algorithm — switch the caller's ranking algorithm for a feed.
export async function PUT(request: NextRequest) {
  return proxyFeedRequest(request, '/feed/algorithm', {
    method: 'PUT',
    body: await request.json().catch(() => ({})),
  });
}
