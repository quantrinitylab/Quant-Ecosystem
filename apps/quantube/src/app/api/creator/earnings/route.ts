import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// GET /api/creator/earnings — the caller's earnings breakdown.
export async function GET(request: NextRequest) {
  return proxyEngineRequest(request, '/creator/earnings');
}
