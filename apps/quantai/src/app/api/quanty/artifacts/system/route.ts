// Quanty system files proxy (Layer 4):
//   GET /api/quanty/artifacts/system -> backend GET /quanty/artifacts/system
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../../_lib/agent-proxy';

export async function GET(request: NextRequest) {
  return proxyAgentRequest(request, '/quanty/artifacts/system');
}
