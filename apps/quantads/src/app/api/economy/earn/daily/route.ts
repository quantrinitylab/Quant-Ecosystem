import { NextRequest } from 'next/server';
import { proxyToBackend } from '@quant/api-client/proxy';

const BACKEND_URL = process.env.QUANTADS_BACKEND_URL || 'http://localhost:3010';

// POST /api/economy/earn/daily -> claim the once-per-day login reward (real,
// credits-ledger, idempotent per user+day). Body: { userId }.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return proxyToBackend(request, {
    backendUrl: BACKEND_URL,
    path: '/economy/wallet/earn/daily',
    body,
  });
}
