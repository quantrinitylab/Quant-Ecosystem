import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../../_lib/engine-proxy';

// POST /api/commerce/trains/search — aggregate a train search.
export async function POST(request: NextRequest) {
  return proxyEngineRequest(request, '/commerce/trains/search', {
    body: await request.json().catch(() => ({})),
  });
}
