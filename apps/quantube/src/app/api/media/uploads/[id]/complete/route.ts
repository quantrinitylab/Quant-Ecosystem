import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../../../_lib/engine-proxy';

// POST /api/media/uploads/:id/complete — assemble + finalize the upload.
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyEngineRequest(request, `/media/uploads/${encodeURIComponent(id)}/complete`, {
    body: await request.json().catch(() => ({})),
  });
}
