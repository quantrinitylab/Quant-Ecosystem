import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// GET /api/economy/subscription — the caller's current tier + entitlements.
export async function GET(request: NextRequest) {
  return proxyEngineRequest(request, '/economy/subscription');
}

// POST /api/economy/subscription — subscribe the caller to a tier.
export async function POST(request: NextRequest) {
  return proxyEngineRequest(request, '/economy/subscription', {
    body: await request.json().catch(() => ({})),
  });
}
