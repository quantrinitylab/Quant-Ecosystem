import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

// QC-F-321: POST /api/message-requests/:id/decline -> backend decline.
// Body-less: identity comes from the Authorization header alone.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToBackend(request, `/message-requests/${encodeURIComponent(id)}/decline`);
}
