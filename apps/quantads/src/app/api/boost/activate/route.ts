import { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client/proxy';

const BACKEND_URL = process.env.QUANTADS_BACKEND_URL || 'http://localhost:3010';

// POST /api/boost/activate -> spend coins from the real ledger and start a
// boost. Body: { userId, postId, packId }.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return proxyToBackend(request, {
    backendUrl: BACKEND_URL,
    path: '/boost/activate',
    body,
  });
}
