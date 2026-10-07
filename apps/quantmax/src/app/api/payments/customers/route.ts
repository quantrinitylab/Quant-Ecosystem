import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// POST /api/payments/customers — create a Stripe Customer.
export async function POST(request: NextRequest) {
  return proxyEngineRequest(request, '/payments/customers', {
    body: await request.json().catch(() => ({})),
  });
}
