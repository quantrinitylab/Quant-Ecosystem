// Prompt library collection proxy (Layer 4):
//   GET  /api/prompts  -> backend GET  /prompts  (list, with filters)
//   POST /api/prompts  -> backend POST /prompts  (create template)
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../_lib/agent-proxy';

export async function GET(request: NextRequest) {
  return proxyAgentRequest(request, '/prompts', {
    searchParams: request.nextUrl.searchParams,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return proxyAgentRequest(request, '/prompts', { body });
}
