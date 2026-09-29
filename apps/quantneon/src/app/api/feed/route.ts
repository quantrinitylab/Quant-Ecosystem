import type { NextRequest } from 'next/server';
import { proxyFeedRequest } from '../_lib/feed-proxy';

// GET /api/feed — the composed feed (recommendations retrieval → ranking),
// paginated via ?feedId=&page=&pageSize=.
export async function GET(request: NextRequest) {
  return proxyFeedRequest(request, '/feed', {
    searchParams: request.nextUrl.searchParams,
  });
}
