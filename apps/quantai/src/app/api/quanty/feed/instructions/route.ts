// Feed instructions proxy (Layer 4):
//   GET /api/quanty/feed/instructions -> backend GET /quanty/feed/instructions
//   PUT /api/quanty/feed/instructions -> backend PUT /quanty/feed/instructions
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../../_lib/agent-proxy';

export async function GET(request: NextRequest) {
  return proxyAgentRequest(request, '/quanty/feed/instructions');
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return proxyAgentRequest(request, '/quanty/feed/instructions', { body });
}
