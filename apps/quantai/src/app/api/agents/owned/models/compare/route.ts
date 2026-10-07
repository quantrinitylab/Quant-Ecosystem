// user-owned-ai seam proxy (Layer 4): POST /api/agents/owned/models/compare
// -> backend POST /agents/owned/models/compare. Forwards bearer + x-request-id.
// (Static segment; sibling of the dynamic [id] route, which Next resolves with
// static-over-dynamic precedence.)
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../../../_lib/agent-proxy';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => undefined);
  return proxyAgentRequest(request, '/agents/owned/models/compare', { body });
}
