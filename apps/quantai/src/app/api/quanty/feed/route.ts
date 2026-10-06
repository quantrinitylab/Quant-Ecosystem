// Feed list proxy (Layer 4):
//   GET /api/quanty/feed?page=&limit= -> backend GET /quanty/feed
//   POST /api/quanty/feed/generate   -> backend POST /quanty/feed/generate
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../_lib/agent-proxy';

export async function GET(request: NextRequest) {
  return proxyAgentRequest(request, '/quanty/feed', {
    searchParams: request.nextUrl.searchParams,
  });
}
