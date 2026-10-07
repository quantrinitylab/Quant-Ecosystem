import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// GET /api/creator/dashboard — the caller's creator dashboard overview.
export async function GET(request: NextRequest) {
  return proxyEngineRequest(request, '/creator/dashboard');
}
