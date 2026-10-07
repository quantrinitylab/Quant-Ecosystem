import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../../_lib/engine-proxy';

// POST /api/creator/tier/upgrade — upgrade the caller's creator tier.
export async function POST(request: NextRequest) {
  return proxyEngineRequest(request, '/creator/tier/upgrade', {
    body: await request.json().catch(() => ({})),
  });
}
