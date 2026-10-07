import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../../_lib/engine-proxy';

// GET /api/media/uploads/:id — upload progress for a session.
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyEngineRequest(request, `/media/uploads/${encodeURIComponent(id)}`);
}
