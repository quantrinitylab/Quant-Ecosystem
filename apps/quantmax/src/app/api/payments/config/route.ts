import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// GET /api/payments/config — non-sensitive payments integration metadata
// (test-mode flag only; never the secret).
export async function GET(request: NextRequest) {
  return proxyEngineRequest(request, '/payments/config');
}
