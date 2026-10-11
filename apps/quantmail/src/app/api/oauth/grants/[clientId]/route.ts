import { NextRequest } from 'next/server';

import { proxyToBackend } from '../../../_lib/proxy';

/** DELETE /api/oauth/grants/:clientId — revoke one app's OAuth grant. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params;
  return proxyToBackend(request, `/oauth/grants/${encodeURIComponent(clientId)}`, {
    method: 'DELETE',
  });
}
