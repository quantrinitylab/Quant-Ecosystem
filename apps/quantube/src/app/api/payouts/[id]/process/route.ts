import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../../_lib/engine-proxy';

// POST /api/payouts/:id/process — move a payout into processing.
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyEngineRequest(request, `/payouts/${encodeURIComponent(id)}/process`, {
    body: await request.json().catch(() => ({})),
  });
}
