import { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client/proxy';

const BACKEND_URL = process.env.QUANTADS_BACKEND_URL || 'http://localhost:3010';

// GET /api/economy/wallet/:userId -> durable credits-ledger balance.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  return proxyToBackend(request, {
    backendUrl: BACKEND_URL,
    path: `/economy/wallet/${encodeURIComponent(userId)}`,
  });
}
