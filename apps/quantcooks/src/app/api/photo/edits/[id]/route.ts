import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../_lib/proxy';

// Photo edit status (C-3B): GET /photo/edits/:id (owner-scoped).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToBackend(request, `/photo/edits/${id}`);
}
