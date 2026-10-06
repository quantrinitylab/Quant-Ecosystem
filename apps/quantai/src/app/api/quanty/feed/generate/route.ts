// Feed generation trigger proxy (Layer 4):
//   POST /api/quanty/feed/generate -> backend POST /quanty/feed/generate
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../../_lib/agent-proxy';

export async function POST(request: NextRequest) {
  return proxyAgentRequest(request, '/quanty/feed/generate');
}
