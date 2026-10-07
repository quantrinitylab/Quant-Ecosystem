import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// GET /api/creator/credits — the caller's credit balance + history.
export async function GET(request: NextRequest) {
  return proxyEngineRequest(request, '/creator/credits');
}
