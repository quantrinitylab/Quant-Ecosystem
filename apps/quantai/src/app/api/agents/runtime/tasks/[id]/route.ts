// agent-runtime seam proxy (Layer 4): GET /api/agents/runtime/tasks/:id
// -> backend GET /agents/runtime/tasks/:id. Forwards bearer + x-request-id.
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../../../_lib/agent-proxy';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyAgentRequest(request, `/agents/runtime/tasks/${encodeURIComponent(id)}`);
}
