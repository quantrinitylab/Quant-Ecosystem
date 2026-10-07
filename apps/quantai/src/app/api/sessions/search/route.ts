// Conversation search proxy (Layer 4): GET /api/sessions/search?q=&page=&pageSize=
// -> backend GET /sessions/search. Forwards bearer + query string.
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../_lib/agent-proxy';

export async function GET(request: NextRequest) {
  return proxyAgentRequest(request, '/sessions/search', {
    searchParams: request.nextUrl.searchParams,
  });
}
