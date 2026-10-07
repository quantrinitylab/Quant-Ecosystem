import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../_lib/engine-proxy';

// GET /api/payouts — the caller's payout history.
export async function GET(request: NextRequest) {
  return proxyEngineRequest(request, '/payouts');
}
