import type { NextRequest } from 'next/server';
import { proxyFederationRequest } from '../../../_lib/federation-proxy';

// DELETE /api/federation/keys/:id — revoke an API key the caller owns.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyFederationRequest(request, `/federation/keys/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
