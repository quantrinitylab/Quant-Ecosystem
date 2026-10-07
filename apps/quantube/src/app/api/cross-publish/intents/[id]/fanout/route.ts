import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../../../_lib/engine-proxy';

// POST /api/cross-publish/intents/:id/fanout — fan an intent across its surfaces.
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyEngineRequest(request, `/cross-publish/intents/${encodeURIComponent(id)}/fanout`, {
    body: await request.json().catch(() => ({})),
  });
}
