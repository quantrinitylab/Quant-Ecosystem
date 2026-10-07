// browser-agent seam proxy (Layer 4):
//   POST /api/agents/browser/sessions -> backend POST /agents/browser/sessions
//   GET  /api/agents/browser/sessions -> backend GET  /agents/browser/sessions
// Forwards bearer + x-request-id.
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../../_lib/agent-proxy';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => undefined);
  return proxyAgentRequest(request, '/agents/browser/sessions', { body });
}

export async function GET(request: NextRequest) {
  return proxyAgentRequest(request, '/agents/browser/sessions');
}
