import { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client/proxy';

const BACKEND_URL = process.env.QUANTADS_BACKEND_URL || 'http://localhost:3010';

// GET /api/creator-economy/purchases/:buyerId/:listingId -> { owned } access gate.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ buyerId: string; listingId: string }> },
) {
  const { buyerId, listingId } = await params;
  return proxyToBackend(request, {
    backendUrl: BACKEND_URL,
    path: `/creator-economy/purchases/${encodeURIComponent(buyerId)}/${encodeURIComponent(listingId)}`,
  });
}
