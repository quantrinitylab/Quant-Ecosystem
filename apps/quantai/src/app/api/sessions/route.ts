// Sessions collection proxy (Layer 4):
//   GET  /api/sessions          -> backend GET  /sessions   (list, paginated)
//   POST /api/sessions          -> backend POST /sessions   (create conversation)
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../_lib/agent-proxy';

export async function GET(request: NextRequest) {
  return proxyAgentRequest(request, '/sessions', {
    searchParams: request.nextUrl.searchParams,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return proxyAgentRequest(request, '/sessions', { body });
}
