// agent-runtime seam proxy (Layer 4): POST /api/agents/runtime/tasks
// -> backend POST /agents/runtime/tasks. Forwards bearer + x-request-id.
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../../_lib/agent-proxy';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => undefined);
  return proxyAgentRequest(request, '/agents/runtime/tasks', { body });
}
