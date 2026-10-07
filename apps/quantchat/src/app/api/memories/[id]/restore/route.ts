// Memory restore seam proxy:
//   POST /api/memories/:id/restore -> backend POST /memories/:id/restore (undo delete)
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/memories/${encodeURIComponent(id)}/restore`);
}
