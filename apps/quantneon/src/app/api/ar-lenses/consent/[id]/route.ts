import type { NextRequest } from 'next/server';
import { proxyArLensesRequest } from '../../../_lib/ar-lenses-proxy';

// DELETE /api/ar-lenses/consent/:id — revoke a previously granted consent.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyArLensesRequest(request, `/ar-lenses/consent/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
