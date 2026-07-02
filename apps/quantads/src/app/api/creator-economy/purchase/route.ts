import { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client/proxy';

const BACKEND_URL = process.env.QUANTADS_BACKEND_URL || 'http://localhost:3010';

// POST /api/creator-economy/purchase -> settle a creator-listing purchase on the
// @quant/credits ledger (buyer debit + seller earn + commission), idempotent per
// purchaseId. Body: { buyerId, listingId, purchaseRef? }.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return proxyToBackend(request, {
    backendUrl: BACKEND_URL,
    path: '/creator-economy/purchase',
    body,
  });
}
