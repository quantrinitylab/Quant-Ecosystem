import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// GET /api/commerce/price-alerts — the active price alerts.
export async function GET(request: NextRequest) {
  return proxyEngineRequest(request, '/commerce/price-alerts');
}

// POST /api/commerce/price-alerts — create a price alert.
export async function POST(request: NextRequest) {
  return proxyEngineRequest(request, '/commerce/price-alerts', {
    body: await request.json().catch(() => ({})),
  });
}
