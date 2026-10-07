import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// GET /api/feed/recommendations?feedId=&k= — raw recommendation pipeline output.
export async function GET(request: NextRequest) {
  return proxyEngineRequest(request, '/feed/recommendations', {
    searchParams: request.nextUrl.searchParams,
  });
}
