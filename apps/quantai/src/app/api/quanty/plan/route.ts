// Layer 4 proxy: GET /api/quanty/plan -> backend GET /quanty/plan.
// Plan card + additional tokens + upgrade URL. No fabricated fallbacks:
// upstream errors are relayed honestly.
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../_lib/agent-proxy';

export async function GET(request: NextRequest) {
  return proxyAgentRequest(request, '/quanty/plan');
}
