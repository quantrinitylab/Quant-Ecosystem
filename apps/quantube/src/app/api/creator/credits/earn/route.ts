import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../../_lib/engine-proxy';

// POST /api/creator/credits/earn — credit the caller's ledger.
export async function POST(request: NextRequest) {
  return proxyEngineRequest(request, '/creator/credits/earn', {
    body: await request.json().catch(() => ({})),
  });
}
