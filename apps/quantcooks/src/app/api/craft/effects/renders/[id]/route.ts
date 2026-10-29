import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../../../_lib/proxy';

// Craft render status (C-2): GET /craft/effects/renders/:id (owner-scoped).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToBackend(request, `/craft/effects/renders/${id}`);
}
