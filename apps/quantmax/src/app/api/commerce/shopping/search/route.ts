import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../../_lib/engine-proxy';

// POST /api/commerce/shopping/search — cross-merchant price comparison.
export async function POST(request: NextRequest) {
  return proxyEngineRequest(request, '/commerce/shopping/search', {
    body: await request.json().catch(() => ({})),
  });
}
