// Quanty artifacts library proxy (Layer 4):
//   GET  /api/quanty/artifacts          -> backend GET  /quanty/artifacts?tab&sort&search&page&pageSize
//   POST /api/quanty/artifacts          -> backend POST /quanty/artifacts
// Forwards the Bearer <redacted> x-request-id and relays status/body.
// No fabricated fallbacks: backend errors surface honestly.
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../_lib/agent-proxy';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  return proxyAgentRequest(request, '/quanty/artifacts', { searchParams });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return proxyAgentRequest(request, '/quanty/artifacts', { body });
}
