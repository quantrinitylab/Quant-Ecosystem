import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../../_lib/engine-proxy';

// POST /api/economy/store/purchase — buy a virtual good with coins.
export async function POST(request: NextRequest) {
  return proxyEngineRequest(request, '/economy/store/purchase', {
    body: await request.json().catch(() => ({})),
  });
}
