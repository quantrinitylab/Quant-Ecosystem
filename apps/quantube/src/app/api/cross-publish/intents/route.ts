import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// GET /api/cross-publish/intents — list the caller's publish intents.
export async function GET(request: NextRequest) {
  return proxyEngineRequest(request, '/cross-publish/intents');
}

// POST /api/cross-publish/intents — create a publish intent for the caller.
export async function POST(request: NextRequest) {
  return proxyEngineRequest(request, '/cross-publish/intents', {
    body: await request.json().catch(() => ({})),
  });
}
