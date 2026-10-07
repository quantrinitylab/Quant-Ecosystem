// Voice status proxy (Layer 4):
//   GET /api/voice/status -> backend GET /voice/status
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../_lib/agent-proxy';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return proxyAgentRequest(request, '/voice/status', {
    searchParams: request.nextUrl.searchParams,
  });
}
