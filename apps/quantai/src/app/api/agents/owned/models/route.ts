// user-owned-ai seam proxy (Layer 4): GET /api/agents/owned/models
// -> backend GET /agents/owned/models (relays ?provider / ?local filters).
// Forwards bearer + x-request-id.
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../../_lib/agent-proxy';

export async function GET(request: NextRequest) {
  return proxyAgentRequest(request, '/agents/owned/models', {
    searchParams: request.nextUrl.searchParams,
  });
}
