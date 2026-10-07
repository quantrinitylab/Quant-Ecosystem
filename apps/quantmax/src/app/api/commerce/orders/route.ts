import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// GET /api/commerce/orders — order history + active orders.
export async function GET(request: NextRequest) {
  return proxyEngineRequest(request, '/commerce/orders');
}

// POST /api/commerce/orders — start tracking an order.
export async function POST(request: NextRequest) {
  return proxyEngineRequest(request, '/commerce/orders', {
    body: await request.json().catch(() => ({})),
  });
}
