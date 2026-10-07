import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// GET /api/interactions/history — the caller's enriched watch history,
// paginated via ?page=&pageSize=. Repointed onto the canonical
// `proxyEngineRequest` and the registered backend `/history` route
// (replacing the legacy `_lib/proxy.ts` helper + unregistered
// `/interactions/history` path). Req 7.1, 7.2, 7.3.
export async function GET(request: NextRequest) {
  return proxyEngineRequest(request, '/history', {
    searchParams: request.nextUrl.searchParams,
  });
}
