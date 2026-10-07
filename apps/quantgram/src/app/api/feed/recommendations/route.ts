import type { NextRequest } from 'next/server';
import { proxyFeedRequest } from '../../_lib/feed-proxy';

// GET /api/feed/recommendations?feedId=&k= — raw recommendation pipeline output.
export async function GET(request: NextRequest) {
  return proxyFeedRequest(request, '/feed/recommendations', {
    searchParams: request.nextUrl.searchParams,
  });
}
