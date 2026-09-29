import type { NextRequest } from 'next/server';
import { proxyFeedRequest } from '../../_lib/feed-proxy';

// POST /api/feed/score — score features through the ml-pipeline inference engine.
export async function POST(request: NextRequest) {
  return proxyFeedRequest(request, '/feed/score', {
    body: await request.json().catch(() => ({})),
  });
}
