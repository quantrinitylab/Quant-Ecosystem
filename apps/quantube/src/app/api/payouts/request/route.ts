import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// POST /api/payouts/request — request a payout (money movement).
export async function POST(request: NextRequest) {
  return proxyEngineRequest(request, '/payouts/request', {
    body: await request.json().catch(() => ({})),
  });
}
