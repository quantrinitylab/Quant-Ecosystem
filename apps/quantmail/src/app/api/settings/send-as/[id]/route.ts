import { NextRequest } from 'next/server';

import { proxyToBackend } from '../../../_lib/proxy';

/** fix/qm-accounts-import — DELETE /api/settings/send-as/:id removes one identity. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToBackend(request, `/settings/send-as/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
