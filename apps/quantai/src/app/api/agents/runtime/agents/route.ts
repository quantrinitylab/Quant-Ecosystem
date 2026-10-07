// agent-runtime seam proxy (Layer 4): GET /api/agents/runtime/agents
// -> backend GET /agents/runtime/agents. Forwards bearer + x-request-id.
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../../_lib/agent-proxy';

export async function GET(request: NextRequest) {
  return proxyAgentRequest(request, '/agents/runtime/agents');
}
