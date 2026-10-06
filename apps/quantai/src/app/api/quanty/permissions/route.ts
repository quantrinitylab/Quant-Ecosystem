// Layer 4 proxy: /api/quanty/permissions -> backend /quanty/permissions.
// Per-tool allow/ask/deny policies.
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../_lib/agent-proxy';

export async function GET(request: NextRequest) {
  return proxyAgentRequest(request, '/quanty/permissions');
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  return proxyAgentRequest(request, '/quanty/permissions', { body });
}
