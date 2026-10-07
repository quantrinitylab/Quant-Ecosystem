import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../../_lib/engine-proxy';

// POST /api/payouts/:id/complete — settle a payout as completed.
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyEngineRequest(request, `/payouts/${encodeURIComponent(id)}/complete`, {
    body: await request.json().catch(() => ({})),
  });
}
