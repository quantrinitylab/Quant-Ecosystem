// Layer 4 proxy: GET /api/quanty/wallet -> backend GET /quanty/wallet.
// Credit balances + earn/spend history from the real ledger.
import type { NextRequest } from 'next/server';
import { proxyAgentRequest } from '../../_lib/agent-proxy';

export async function GET(request: NextRequest) {
  return proxyAgentRequest(request, '/quanty/wallet');
}
