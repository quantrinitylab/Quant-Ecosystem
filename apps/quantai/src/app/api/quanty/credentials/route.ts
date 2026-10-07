// Layer 4 proxy: GET /api/quanty/credentials -> backend GET /quanty/credentials.
// Stored grant METADATA only — token values never leave the backend.
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../_lib/agent-proxy';

export async function GET(request: NextRequest) {
  return proxyAgentRequest(request, '/quanty/credentials');
}
