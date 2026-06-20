// Daily usage analytics proxy (Layer 4): GET /api/usage/daily?days=30
// -> backend GET /usage/daily. Forwards bearer + query string.
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../_lib/agent-proxy';

export async function GET(request: NextRequest) {
  return proxyAgentRequest(request, '/usage/daily', {
    searchParams: request.nextUrl.searchParams,
  });
}
