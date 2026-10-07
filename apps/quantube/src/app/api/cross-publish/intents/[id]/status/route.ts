import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../../../_lib/engine-proxy';

// GET /api/cross-publish/intents/:id/status — fanout status for an intent.
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyEngineRequest(request, `/cross-publish/intents/${encodeURIComponent(id)}/status`);
}
