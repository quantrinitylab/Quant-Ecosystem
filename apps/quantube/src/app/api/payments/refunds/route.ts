import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// POST /api/payments/refunds — refund a Stripe PaymentIntent.
export async function POST(request: NextRequest) {
  return proxyEngineRequest(request, '/payments/refunds', {
    body: await request.json().catch(() => ({})),
  });
}
