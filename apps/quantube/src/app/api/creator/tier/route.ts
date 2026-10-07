import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// GET /api/creator/tier — the caller's current tier + benefits.
export async function GET(request: NextRequest) {
  return proxyEngineRequest(request, '/creator/tier');
}
