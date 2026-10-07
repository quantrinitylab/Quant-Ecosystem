import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// GET /api/economy/wallet — the caller's coin wallet + balance.
export async function GET(request: NextRequest) {
  return proxyEngineRequest(request, '/economy/wallet');
}
