// Memory deletion seam proxy:
//   DELETE /api/memories/:id -> backend DELETE /memories/:id (soft-delete + undo window)
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToBackend(request, `/memories/${encodeURIComponent(id)}`);
}
