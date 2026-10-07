// user-owned-ai seam proxy (Layer 4): GET /api/agents/owned/models/:id
// -> backend GET /agents/owned/models/:id. Forwards bearer + x-request-id.
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../../../_lib/agent-proxy';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyAgentRequest(request, `/agents/owned/models/${encodeURIComponent(id)}`);
}
