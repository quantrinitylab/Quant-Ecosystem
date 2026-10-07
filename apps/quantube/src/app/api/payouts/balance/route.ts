import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// GET /api/payouts/balance — the caller's available (withdrawable) balance.
export async function GET(request: NextRequest) {
  return proxyEngineRequest(request, '/payouts/balance');
}
