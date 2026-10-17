// Memory move-to-private seam proxy (QC-F-450):
//   POST /api/memories/:id/move-to-private -> backend POST /memories/:id/move-to-private
// The X-Memories-Unlock header is forwarded by the shared proxy allowlist.
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/memories/${encodeURIComponent(id)}/move-to-private`);
}
