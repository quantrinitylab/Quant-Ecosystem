import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../../../_lib/proxy';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  const { id, commentId } = await params;
  return proxyToBackend(request, `/collaboration/${id}/comments/${commentId}/resolve`);
}
