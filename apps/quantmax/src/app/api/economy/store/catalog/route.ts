import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../../_lib/engine-proxy';

// GET /api/economy/store/catalog — the virtual goods catalog.
export async function GET(request: NextRequest) {
  return proxyEngineRequest(request, '/economy/store/catalog');
}
