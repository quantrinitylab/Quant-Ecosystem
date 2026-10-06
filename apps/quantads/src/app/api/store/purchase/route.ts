import { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client/proxy';

const BACKEND_URL = process.env.QUANTADS_BACKEND_URL || 'http://localhost:3010';

// POST /api/store/purchase -> real coin-ledger purchase of a catalog item.
// Body: { userId, itemId }.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return proxyToBackend(request, {
    backendUrl: BACKEND_URL,
    path: '/store/purchase',
    body,
  });
}
