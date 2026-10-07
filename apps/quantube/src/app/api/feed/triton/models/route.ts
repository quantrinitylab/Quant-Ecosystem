import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../../_lib/engine-proxy';

// GET /api/feed/triton/models — models registered with the Triton client.
export async function GET(request: NextRequest) {
  return proxyEngineRequest(request, '/feed/triton/models');
}

// POST /api/feed/triton/models — register a Triton-served model.
export async function POST(request: NextRequest) {
  return proxyEngineRequest(request, '/feed/triton/models', {
    body: await request.json().catch(() => ({})),
  });
}
