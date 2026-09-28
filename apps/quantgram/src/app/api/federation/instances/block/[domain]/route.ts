import type { NextRequest } from 'next/server';
import { proxyFederationRequest } from '../../../../_lib/federation-proxy';

// DELETE /api/federation/instances/block/:domain — unblock a remote instance.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ domain: string }> },
) {
  const { domain } = await params;
  return proxyFederationRequest(
    request,
    `/federation/instances/block/${encodeURIComponent(domain)}`,
    { method: 'DELETE' },
  );
}
