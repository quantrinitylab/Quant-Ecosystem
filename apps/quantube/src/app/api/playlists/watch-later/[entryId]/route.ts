import type { NextRequest } from 'next/server';
import { proxyEngineRequest } from '../../../_lib/engine-proxy';

// DELETE /api/playlists/watch-later/[entryId] — remove an entry from Watch
// Later (idempotent no-op when absent). Forwards to the registered backend
// `/playlists/watch-later/:entryId` route. Req 7.1, 7.4.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> },
) {
  const { entryId } = await params;
  return proxyEngineRequest(request, `/playlists/watch-later/${entryId}`);
}
