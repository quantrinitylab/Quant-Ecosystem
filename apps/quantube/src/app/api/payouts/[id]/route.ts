import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// GET /api/payouts/:id — a single payout's status.
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyEngineRequest(request, `/payouts/${encodeURIComponent(id)}`);
}
