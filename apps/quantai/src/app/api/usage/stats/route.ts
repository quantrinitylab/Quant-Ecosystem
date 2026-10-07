// usage stats proxy (Layer 4): GET /api/usage/stats -> backend GET /usage/stats.
// Forwards the bearer + x-request-id and relays status/body. Powers the real,
// activity-derived stats header (streak / xp / level) on the QuantAI home page.
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../_lib/agent-proxy';

export async function GET(request: NextRequest) {
  return proxyAgentRequest(request, '/usage/stats');
}
