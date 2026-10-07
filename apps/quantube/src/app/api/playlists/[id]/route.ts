import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../_lib/engine-proxy';

// GET /api/playlists/[id] — playlist detail (header + ordered videos).
// Forwards to the registered backend `/playlists/:id` route. Req 7.1.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyEngineRequest(request, `/playlists/${id}`);
}
