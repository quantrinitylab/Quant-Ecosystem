import { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client/proxy';

const BACKEND_URL = process.env.QUANTADS_BACKEND_URL || 'http://localhost:3010';

// GET /api/creator-economy/purchases/:buyerId -> the buyer's owned purchases.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ buyerId: string }> },
) {
  const { buyerId } = await params;
  return proxyToBackend(request, {
    backendUrl: BACKEND_URL,
    path: `/creator-economy/purchases/${encodeURIComponent(buyerId)}`,
  });
}
