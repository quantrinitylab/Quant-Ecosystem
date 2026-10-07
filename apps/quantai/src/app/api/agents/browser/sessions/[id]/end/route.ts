// browser-agent seam proxy (Layer 4): POST /api/agents/browser/sessions/:id/end
// -> backend POST /agents/browser/sessions/:id/end. Forwards bearer + x-request-id.
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../../../../_lib/agent-proxy';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => undefined);
  return proxyAgentRequest(request, `/agents/browser/sessions/${encodeURIComponent(id)}/end`, {
    body,
  });
}
