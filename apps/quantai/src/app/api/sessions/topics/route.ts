// Topics proxy (Layer 4):
//   GET /api/sessions/topics -> backend GET /sessions/topics (distinct topics + counts)
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../_lib/agent-proxy';

export async function GET(request: NextRequest) {
  return proxyAgentRequest(request, '/sessions/topics', {
    searchParams: request.nextUrl.searchParams,
  });
}
