import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// POST /api/economy/gifts — send a virtual good gift to another user.
export async function POST(request: NextRequest) {
  return proxyEngineRequest(request, '/economy/gifts', {
    body: await request.json().catch(() => ({})),
  });
}
