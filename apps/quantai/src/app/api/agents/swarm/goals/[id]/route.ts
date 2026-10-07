// agent-swarm seam proxy (Layer 4): GET /api/agents/swarm/goals/:id
// -> backend GET /agents/swarm/goals/:id. Forwards bearer + x-request-id.
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../../../_lib/agent-proxy';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyAgentRequest(request, `/agents/swarm/goals/${encodeURIComponent(id)}`);
}
