import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../../_lib/engine-proxy';

// POST /api/creator/monetization/tip — record a tip to a creator from the caller.
export async function POST(request: NextRequest) {
  return proxyEngineRequest(request, '/creator/monetization/tip', {
    body: await request.json().catch(() => ({})),
  });
}
