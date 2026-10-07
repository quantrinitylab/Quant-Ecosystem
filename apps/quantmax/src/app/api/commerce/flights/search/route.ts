import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../../_lib/engine-proxy';

// POST /api/commerce/flights/search — aggregate a flight search.
export async function POST(request: NextRequest) {
  return proxyEngineRequest(request, '/commerce/flights/search', {
    body: await request.json().catch(() => ({})),
  });
}
