// quant-tools seam proxy (Layer 4): GET /api/tools/orchestrator/catalog
// -> backend GET /tools/orchestrator/catalog. Forwards bearer + x-request-id.
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../../_lib/agent-proxy';

export async function GET(request: NextRequest) {
  return proxyAgentRequest(request, '/tools/orchestrator/catalog');
}
