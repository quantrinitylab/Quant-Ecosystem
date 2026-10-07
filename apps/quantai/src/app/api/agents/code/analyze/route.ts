// code-agent seam proxy (Layer 4): POST /api/agents/code/analyze
// -> backend POST /agents/code/analyze. Forwards bearer + x-request-id.
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../../_lib/agent-proxy';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => undefined);
  return proxyAgentRequest(request, '/agents/code/analyze', { body });
}
