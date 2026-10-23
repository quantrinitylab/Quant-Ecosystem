import { NextRequest } from 'next/server';

import { proxyToBackend } from '../../../../_lib/proxy';

/**
 * fix/qm-accounts-import — POST /api/settings/send-as/:id/verify consumes the
 * 6-digit code mailed to the address and activates it as a From identity.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToBackend(request, `/settings/send-as/${encodeURIComponent(id)}/verify`);
}
