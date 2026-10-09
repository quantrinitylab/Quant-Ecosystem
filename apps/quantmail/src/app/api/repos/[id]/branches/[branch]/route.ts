import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../../_lib/proxy';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; branch: string }> },
) {
  const { id, branch } = await params;
  return proxyToBackend(request, `/repos/${id}/branches/${encodeURIComponent(branch)}`, {
    method: 'DELETE',
  });
}
