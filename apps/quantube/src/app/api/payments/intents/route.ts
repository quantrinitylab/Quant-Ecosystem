import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// POST /api/payments/intents — create a Stripe PaymentIntent for a paid surface.
export async function POST(request: NextRequest) {
  return proxyEngineRequest(request, '/payments/intents', {
    body: await request.json().catch(() => ({})),
  });
}
