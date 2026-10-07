// quant-tools seam proxy (Layer 4): POST /api/tools/orchestrator/execute
// -> backend POST /tools/orchestrator/execute. Forwards bearer + x-request-id.
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../../_lib/agent-proxy';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => undefined);
  return proxyAgentRequest(request, '/tools/orchestrator/execute', { body });
}
